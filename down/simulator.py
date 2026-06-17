"""
下位机模拟器 — TCP 双向通信。

- 自主模式：沿固定轨迹发送模拟 GPS 数据。
- 跟踪模式：收到上位机下发的 path.waypoints 后，沿路点逐步移动。

用法:
    python simulator.py --fast        # 快速模式 0.3s 间隔
    python simulator.py --interval 2  # 2 秒间隔
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import select
import socket
import time
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("down-simulator")

# ---------------------------------------------------------------------------
# 模拟场景
# ---------------------------------------------------------------------------

CENTER_LNG = 106.293186
CENTER_LAT = 29.593694

DEFAULT_DEVICES = [
    {"coneId": "cone_01", "label": "C1"},
    {"coneId": "cone_02", "label": "C2"},
]



# ---------------------------------------------------------------------------
# 单路锥模拟
# ---------------------------------------------------------------------------


class ConeSimulator:
    """一个路锥的模拟状态。"""

    def __init__(self, cone_id: str, home_position: tuple[float, float], index: int) -> None:
        self.cone_id = cone_id
        self._home_lng, self._home_lat = home_position
        self._tick = 0
        self.battery = 100.0 - index * 8.0
        self.last_fallen = False

        # 当前位置（静止时保持初始位置）
        self._cur_lng = self._home_lng
        self._cur_lat = self._home_lat

        # 跟踪模式
        self._tracking = False
        self._waypoints: list[tuple[float, float]] = []
        self._wp_index = 0

    @property
    def tracking(self) -> bool:
        return self._tracking and self._wp_index < len(self._waypoints)

    def start_tracking(self, waypoints: list[tuple[float, float]]) -> None:
        self._waypoints = waypoints
        self._wp_index = 0
        self._tracking = True
        logger.info("%s 进入跟踪模式，共 %d 个路点", self.cone_id, len(waypoints))

    def next(self) -> dict[str, Any]:
        """生成下一帧遥测数据——只传坐标。"""
        self._tick += 1

        if self.tracking:
            self._cur_lng, self._cur_lat = self._waypoints[self._wp_index]
            self._wp_index += 1
            if self._wp_index >= len(self._waypoints):
                logger.info("%s 路点全部走完，停在目标位置", self.cone_id)
                self._tracking = False
                self._wp_index = 0
                self._waypoints = []

        return {
            "type": "telemetry",
            "coneId": self.cone_id,
            "ts": int(time.time() * 1000),
            "lng": round(self._cur_lng + random.gauss(0, 3e-6), 8),
            "lat": round(self._cur_lat + random.gauss(0, 2e-6), 8),
        }


# ---------------------------------------------------------------------------
# TCP 双向通信 + 主循环
# ---------------------------------------------------------------------------


def _read_line(sock: socket.socket, buffer: str) -> tuple[str | None, str]:
    """用 select 检查可读性后读数据，返回 (完整行 or None, 剩余 buffer)。"""
    ready, _, _ = select.select([sock], [], [], 0.0)
    if not ready:
        return None, buffer

    try:
        data = sock.recv(4096)
    except (BlockingIOError, socket.timeout, ConnectionError):
        return None, buffer

    if not data:
        raise ConnectionError("下位机连接断开")

    buffer += data.decode("utf-8", errors="replace")
    if "\n" in buffer:
        line, rest = buffer.split("\n", 1)
        return line.strip(), rest
    return None, buffer


def _process_command(line: str, cones: dict[str, ConeSimulator]) -> None:
    """处理上位机下发的指令。"""
    try:
        cmd = json.loads(line)
    except json.JSONDecodeError:
        logger.debug("非 JSON 指令: %.80s", line)
        return

    cmd_type = cmd.get("type", "")
    if cmd_type == "path.waypoints":
        cone_id = cmd.get("coneId", "")
        waypoints_raw = cmd.get("waypoints", [])
        waypoints = [
            (float(wp["lng"]), float(wp["lat"]))
            for wp in waypoints_raw
            if "lng" in wp and "lat" in wp
        ]
        if cone_id in cones and waypoints:
            cones[cone_id].start_tracking(waypoints)
        else:
            logger.warning("收到未知路锥的路点指令: %s", cone_id)


def run(host: str, port: int, devices: list[dict], interval: float) -> None:
    """主循环：连接上位机，收发数据。"""
    # 每个路锥的初始静止位置
    home_positions = [
        (CENTER_LNG - 0.00030, CENTER_LAT + 0.00020),  # cone_01
        (CENTER_LNG + 0.00035, CENTER_LAT - 0.00015),  # cone_02
    ]

    cones = {
        d["coneId"]: ConeSimulator(d["coneId"], home_positions[i], i)
        for i, d in enumerate(devices)
    }

    logger.info("下位机模拟器启动 → %s:%d", host, port)
    logger.info("模拟设备: %s，间隔 %.1fs", list(cones.keys()), interval)

    reconnect_delay = 1.0

    while True:
        sock: socket.socket | None = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((host, port))
            sock.settimeout(0.0)  # 非阻塞发送/接收
            logger.info("已连接上位机 %s:%d", host, port)
            reconnect_delay = 1.0

            recv_buffer = ""

            while True:
                # 1. 发送一帧 telemetry
                parts: list[str] = []
                for cone in cones.values():
                    data = cone.next()
                    line = json.dumps(data, ensure_ascii=False) + "\n"
                    try:
                        sock.sendall(line.encode("utf-8"))
                    except (BrokenPipeError, ConnectionResetError, OSError) as e:
                        logger.warning("发送失败: %s", e)
                        raise

                    track = f" [跟踪{cone._wp_index}/{len(cone._waypoints)}]" if cone.tracking else ""
                    parts.append(f"{cone.cone_id} ({data['lng']:.6f},{data['lat']:.6f}){track}")

                logger.info("已发送 → %s", " | ".join(parts))

                # 2. 在间隔期间读取上位机下发的指令
                deadline = time.time() + interval
                while time.time() < deadline:
                    try:
                        ready, _, _ = select.select([sock], [], [], 0.0)
                        if ready:
                            data = sock.recv(4096)
                            if not data:
                                raise ConnectionError("下位机连接断开")
                            recv_buffer += data.decode("utf-8", errors="replace")
                            while "\n" in recv_buffer:
                                line, recv_buffer = recv_buffer.split("\n", 1)
                                line = line.strip()
                                if line:
                                    logger.info("收到指令: %.120s", line)
                                    _process_command(line, cones)
                    except (BlockingIOError, socket.timeout):
                        pass
                    except ConnectionError:
                        raise
                    time.sleep(0.03)

        except (ConnectionRefusedError, socket.timeout, ConnectionError, OSError) as e:
            logger.warning("连接失败/断开 (%s)，%.0f 秒后重试", e, reconnect_delay)
            time.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 1.5, 30.0)
        except KeyboardInterrupt:
            logger.info("模拟器已停止")
            break
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="下位机模拟器 — TCP 双向通信")
    parser.add_argument("--host", default="localhost", help="上位机 IP（默认 localhost）")
    parser.add_argument("--port", type=int, default=9000, help="上位机 TCP 端口（默认 9000）")
    parser.add_argument("--interval", type=float, default=1.0, help="发送间隔，秒（默认 1.0）")
    parser.add_argument("--cone-count", type=int, default=2, help="路锥数量（默认 2）")
    parser.add_argument("--fast", action="store_true", help="快速模式 0.3s 间隔")
    args = parser.parse_args()

    devices = DEFAULT_DEVICES[: min(args.cone_count, 3)]
    run(
        host=args.host,
        port=args.port,
        devices=devices,
        interval=0.3 if args.fast else args.interval,
    )


if __name__ == "__main__":
    main()
