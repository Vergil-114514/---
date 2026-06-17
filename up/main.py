"""
智能路锥集群上位机 — 完整闭环。

链路：
  下位机 ──TCP──→ 上位机 ──WebSocket──→ 前端
         ←──TCP──           ←──WebSocket──

闭环流程：
  1. 下位机持续上报当前坐标 → 上位机转发前端实时显示
  2. 前端拖拽设目标点 → 上位机路径规划 → 下位机接收路点跟踪
  3. 上位机将规划路径广播前端展示
"""

from __future__ import annotations

import asyncio
import json
import logging
import time as _time
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from cone_state import StateManager
from path_planner import plan_path
from protocol import (
    build_gateway_status,
    build_messages,
    build_route_plan,
    build_route_status,
    build_waypoints_command,
    register_device,
    validate_message,
)

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("cone-gateway")

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

TCP_HOST = "0.0.0.0"
TCP_PORT = 9000
HTTP_HOST = "0.0.0.0"
HTTP_PORT = 8080
PATH_STEP_METERS = 2.0  # 路径规划路点间距

# ---------------------------------------------------------------------------
# 全局状态
# ---------------------------------------------------------------------------

states = StateManager()

# 下位机 TCP writer，用于下发路点指令（当前只支持单下位机）
_down_writer: asyncio.StreamWriter | None = None
_down_writer_lock = asyncio.Lock()


async def send_to_down(message: dict[str, Any]) -> bool:
    """通过 TCP 向下位机发送消息。返回是否成功。"""
    global _down_writer
    async with _down_writer_lock:
        if _down_writer is None:
            logger.warning("下位机未连接，无法下发指令")
            return False
        try:
            line = json.dumps(message, ensure_ascii=False) + "\n"
            _down_writer.write(line.encode("utf-8"))
            await _down_writer.drain()
            return True
        except Exception:
            logger.exception("向下位机发送失败")
            return False


# ---------------------------------------------------------------------------
# ConnectionManager — WebSocket 广播
# ---------------------------------------------------------------------------


class ConnectionManager:
    """管理所有前端 WebSocket 连接。"""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._tcp_device_count: int = 0

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("前端 WebSocket 已连接（%d 个前端）", len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        try:
            self._connections.remove(websocket)
        except ValueError:
            pass
        logger.info("前端 WebSocket 已断开（%d 个前端）", len(self._connections))

    async def broadcast(self, message: str) -> None:
        if not self._connections:
            return
        dead: list[WebSocket] = []
        for conn in self._connections:
            try:
                await conn.send_text(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.disconnect(conn)

    @property
    def ws_count(self) -> int:
        return len(self._connections)

    def device_connected(self) -> None:
        self._tcp_device_count += 1
        logger.info("下位机 TCP 已连接（%d 个）", self._tcp_device_count)

    def device_disconnected(self) -> None:
        self._tcp_device_count = max(0, self._tcp_device_count - 1)
        logger.info("下位机 TCP 已断开（%d 个）", self._tcp_device_count)

    @property
    def device_count(self) -> int:
        return self._tcp_device_count


manager = ConnectionManager()

# ---------------------------------------------------------------------------
# TCP Server — 双向通信
# ---------------------------------------------------------------------------


async def handle_tcp_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """处理单下位机 TCP 连接（双向）。

    上行（读）：接收下位机 telemetry → 更新状态 → 广播前端。
    下行（写）：前端设定目标后，路径规划结果通过此连接下发。
    """
    global _down_writer

    addr = writer.get_extra_info("peername", "unknown")
    logger.info("下位机连接: %s", addr)

    async with _down_writer_lock:
        _down_writer = writer
    manager.device_connected()

    buffer = ""

    try:
        while True:
            data = await reader.read(4096)
            if not data:
                break

            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                logger.warning("下位机 %s 发送非 UTF-8 数据，跳过", addr)
                continue

            buffer += text

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line:
                    continue

                validated = validate_message(line)
                if validated is None:
                    continue

                # 更新状态
                cone_id = validated["coneId"]
                states.update_telemetry(validated)

                # 构建并广播前端消息
                messages = build_messages(validated)
                for msg in messages:
                    try:
                        payload = json.dumps(msg, ensure_ascii=False)
                        await manager.broadcast(payload)
                    except Exception:
                        logger.exception("广播消息失败")

                # 如果路锥在跟踪路径且已走完，发送完成通知
                cone = states.get(cone_id)
                if not cone.has_active_path and cone.has_target:
                    logger.info("%s 路径跟踪完成", cone_id)
                    route_msg = build_route_status(cone_id, "completed", 0)
                    await manager.broadcast(json.dumps(route_msg, ensure_ascii=False))
                    cone.clear_path()

    except asyncio.CancelledError:
        pass
    except ConnectionResetError:
        logger.info("下位机 %s 连接重置", addr)
    except Exception:
        logger.exception("处理下位机 %s 时异常", addr)
    finally:
        async with _down_writer_lock:
            if _down_writer is writer:
                _down_writer = None
        manager.device_disconnected()
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass
        logger.info("下位机 %s 连接已关闭", addr)


async def start_tcp_server() -> asyncio.Server:
    server = await asyncio.start_server(handle_tcp_client, TCP_HOST, TCP_PORT)
    logger.info("TCP Server 已启动: %s:%d", TCP_HOST, TCP_PORT)
    return server


# ---------------------------------------------------------------------------
# FastAPI 应用
# ---------------------------------------------------------------------------

app = FastAPI(title="智能路锥集群上位机")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """前端 WebSocket 接入点。

    上行：接收 cone.move.command → 路径规划 → 下发下位机 + 广播前端。
    下行：转发下位机 telemetry 到前端（已在 TCP handler 中完成）。
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                logger.debug("前端非 JSON: %.80s", data)
                continue

            msg_type = msg.get("type", "")
            logger.info("前端消息: type=%s", msg_type)

            if msg_type == "cone.move.command":
                await _handle_move_command(websocket, msg)
            else:
                logger.debug("未知前端消息类型: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("前端 WebSocket 断开")
    finally:
        manager.disconnect(websocket)


async def _handle_move_command(websocket: WebSocket, msg: dict[str, Any]) -> None:
    """处理前端拖拽移动指令：路径规划 → 下发下位机 → 广播前端。"""
    payload = msg.get("payload", {})
    cone_id = payload.get("coneId", "")
    target = payload.get("target", {})
    target_lng = target.get("lng")
    target_lat = target.get("lat")

    if not cone_id or target_lng is None or target_lat is None:
        await websocket.send_text(json.dumps({
            "type": "command.ack",
            "payload": {
                "requestId": msg.get("requestId", ""),
                "status": "rejected",
                "note": "缺少 coneId 或 target 坐标",
            },
        }, ensure_ascii=False))
        return

    target_lng = float(target_lng)
    target_lat = float(target_lat)
    logger.info("路径规划请求: %s → (%.6f, %.6f)", cone_id, target_lng, target_lat)

    # 获取当前位置
    cone = states.get(cone_id)
    current = cone.current_position()
    if current is None:
        logger.warning("%s 尚无当前位置，无法规划路径", cone_id)
        await websocket.send_text(json.dumps({
            "type": "command.ack",
            "payload": {
                "requestId": msg.get("requestId", ""),
                "status": "rejected",
                "note": f"{cone_id} 尚无定位数据，请等待下位机上报",
            },
        }, ensure_ascii=False))
        return

    cur_lng, cur_lat = current
    logger.info("  当前位置: (%.6f, %.6f)", cur_lng, cur_lat)

    # 保存目标
    states.set_target(cone_id, target_lng, target_lat)

    # 路径规划
    waypoints = plan_path(cur_lng, cur_lat, target_lng, target_lat, PATH_STEP_METERS)
    states.set_path(cone_id, waypoints)
    logger.info("  路径规划: %d 个路点, 步长 %.1fm", len(waypoints), PATH_STEP_METERS)

    # 下发到下位机
    waypoint_cmd = build_waypoints_command(cone_id, waypoints, PATH_STEP_METERS)
    sent = await send_to_down(waypoint_cmd)
    if sent:
        logger.info("  路点已下发至下位机")

    # 广播路径到前端
    route_msg = build_route_plan(cone_id, waypoints)
    await manager.broadcast(json.dumps(route_msg, ensure_ascii=False))
    logger.info("  路径已推送前端")

    # 发送跟踪状态
    status_msg = build_route_status(cone_id, "active", len(waypoints))
    await manager.broadcast(json.dumps(status_msg, ensure_ascii=False))

    # ACK
    await websocket.send_text(json.dumps({
        "type": "command.ack",
        "payload": {
            "requestId": msg.get("requestId", ""),
            "status": "accepted",
            "waypoints": len(waypoints),
            "sentToDevice": sent,
        },
    }, ensure_ascii=False))


# -- HTTP 端点 --------------------------------------------------------


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "running",
        "tcp": {
            "host": TCP_HOST,
            "port": TCP_PORT,
            "deviceCount": manager.device_count,
        },
        "websocket": {
            "clientCount": manager.ws_count,
        },
        "cones": {
            cid: {
                "online": states.get(cid).online,
                "hasPosition": states.get(cid).has_current,
                "hasTarget": states.get(cid).has_target,
                "pathRemaining": states.get(cid).path_remaining(),
            }
            for cid in states.cone_ids
        },
    }


@app.post("/api/hardware/gps")
async def receive_hardware_gps(data: dict[str, Any]) -> dict[str, Any]:
    """兼容 HTTP GPS 上报接口（调试用）。"""
    required = {"coneId", "lng", "lat"}
    missing = required - data.keys()
    if missing:
        return {"error": f"缺少必要参数: {missing}", "status": "failed"}

    states.update_telemetry(data)
    frontend_message = {
        "type": "gps.position",
        "payload": {
            "coneId": data["coneId"],
            "lng": float(data["lng"]),
            "lat": float(data["lat"]),
            "accuracyM": float(data.get("accuracyM", 1.0)),
            "coordSys": data.get("coordSys", "GCJ-02"),
            "timestamp": data.get("timestamp") or int(_time.time() * 1000),
        },
    }
    await manager.broadcast(json.dumps(frontend_message, ensure_ascii=False))
    return {"status": "success", "forwarded": True}


@app.post("/api/cluster/command")
async def cluster_command(data: dict[str, Any]) -> dict[str, Any]:
    logger.info("集群控制指令: %s", data)
    return {"status": "accepted", "message": "cluster command accepted"}


@app.post("/api/device/register")
async def register_device_endpoint(data: dict[str, Any]) -> dict[str, Any]:
    cone_id = data.pop("coneId", None)
    if not cone_id:
        return {"error": "缺少 coneId", "status": "failed"}
    register_device(cone_id, data)
    logger.info("设备已注册: %s → %s", cone_id, data)
    return {"status": "success", "coneId": cone_id}


# ---------------------------------------------------------------------------
# 启动
# ---------------------------------------------------------------------------


async def startup_event() -> None:
    logger.info("上位机应用启动中...")


async def shutdown_event() -> None:
    logger.info("上位机应用关闭")


app.add_event_handler("startup", startup_event)
app.add_event_handler("shutdown", shutdown_event)


async def main() -> None:
    tcp_server = await start_tcp_server()

    config = uvicorn.Config(
        app,
        host=HTTP_HOST,
        port=HTTP_PORT,
        log_level="info",
        log_config=None,
    )
    http_server = uvicorn.Server(config)

    logger.info("=" * 50)
    logger.info("智能路锥集群上位机已就绪")
    logger.info("  TCP Server : %s:%d  (下位机接入)", TCP_HOST, TCP_PORT)
    logger.info("  HTTP/WS    : %s:%d  (前端连接)", HTTP_HOST, HTTP_PORT)
    logger.info("  路径步长   : %.1f m", PATH_STEP_METERS)
    logger.info("=" * 50)

    await http_server.serve()
    tcp_server.close()
    await tcp_server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
