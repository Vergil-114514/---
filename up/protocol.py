"""
下位机 TCP → 上位机 协议解析与消息构建。

下位机通过 TCP 发送的 JSON 行协议，本模块负责：
- 校验数据合法性
- 将下位机精简格式包装为前端 WebSocket 兼容的完整消息
"""

from __future__ import annotations

import json
import logging
import time as _time
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 下位机上行数据校验
# ---------------------------------------------------------------------------

_REQUIRED_FIELDS = {"type", "coneId", "lng", "lat"}

# 设备注册表 — 上位机维护，用于补全前端需要的设备元信息
_DEVICE_REGISTRY: dict[str, dict[str, Any]] = {
    "cone_01": {
        "label": "C1",
        "uwbTagId": "uwb_tag_01",
        "gpsDeviceId": "gps_cone_01",
        "position_source": "tcp_gateway",
    },
    "cone_02": {
        "label": "C2",
        "uwbTagId": "uwb_tag_02",
        "gpsDeviceId": "gps_cone_02",
        "position_source": "tcp_gateway",
    },
}


def register_device(cone_id: str, info: dict[str, Any]) -> None:
    """动态注册/更新设备信息，便于后续扩展。"""
    _DEVICE_REGISTRY[cone_id] = {**_DEVICE_REGISTRY.get(cone_id, {}), **info}


def get_device_info(cone_id: str) -> dict[str, Any]:
    """获取已注册设备信息，未注册返回空字典。"""
    return _DEVICE_REGISTRY.get(cone_id, {})


def validate_message(raw: str) -> dict[str, Any] | None:
    """解析并校验下位机发来的 JSON 行。

    Returns:
        校验通过的字典；校验失败返回 None。
    """
    if not raw or not raw.strip():
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("TCP 收到非法 JSON: %.80s", raw)
        return None

    if not isinstance(data, dict):
        logger.warning("TCP 数据不是 JSON 对象: %.80s", raw)
        return None

    missing = _REQUIRED_FIELDS - data.keys()
    if missing:
        logger.warning("TCP 数据缺少必填字段 %s: %.120s", missing, raw)
        return None

    # 校验坐标范围
    lng = float(data["lng"])
    lat = float(data["lat"])
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        logger.warning("TCP 坐标越界: lng=%s, lat=%s", lng, lat)
        return None

    return data


# ---------------------------------------------------------------------------
# 消息构建 — 下位机数据 → 前端 WebSocket 消息
# ---------------------------------------------------------------------------


def build_telemetry(raw: dict[str, Any]) -> dict[str, Any]:
    """从下位机原始数据构建精简 cone.telemetry 消息（只传坐标）。"""
    cone_id = raw["coneId"]
    now_ms = raw.get("ts") or _now_ms()
    lng = float(raw["lng"])
    lat = float(raw["lat"])

    return {
        "type": "cone.telemetry",
        "payload": {
            "coneId": cone_id,
            "ts": now_ms,
            "online": True,
            "position": {
                "lng": lng,
                "lat": lat,
                "accuracyM": float(raw.get("accuracy", 0.8)),
                "source": "tcp_gateway",
            },
            "health": {
                "stale": False,
                "lastSeenMs": now_ms,
            },
        },
    }


def build_gps_position(raw: dict[str, Any]) -> dict[str, Any]:
    """构建 gps.position 消息。"""
    cone_id = raw["coneId"]
    return {
        "type": "gps.position",
        "payload": {
            "coneId": cone_id,
            "lng": float(raw["lng"]),
            "lat": float(raw["lat"]),
            "accuracyM": float(raw.get("gps_accuracy", raw.get("accuracy", 1.6))),
            "coordSys": raw.get("coordSys", "GCJ-02"),
            "timestamp": raw.get("ts") or _now_ms(),
        },
    }


def build_uwb_position(raw: dict[str, Any]) -> dict[str, Any] | None:
    """构建 uwb.position 消息。需要下位机提供 uwb_x/uwb_y 或 lng/lat。"""
    cone_id = raw["coneId"]
    lng = raw.get("uwb_lng", raw.get("lng"))
    lat = raw.get("uwb_lat", raw.get("lat"))
    if lng is None or lat is None:
        return None
    return {
        "type": "uwb.position",
        "payload": {
            "coneId": cone_id,
            "lng": float(lng),
            "lat": float(lat),
            "accuracyM": float(raw.get("uwb_accuracy", 0.22)),
            "quality": float(raw.get("uwb_quality", 0.9)),
            "anchorsUsed": raw.get("uwb_anchors", []),
            "timestamp": raw.get("ts") or _now_ms(),
        },
    }


def build_imu_raw(raw: dict[str, Any]) -> dict[str, Any]:
    """构建 imu.raw 消息。"""
    cone_id = raw["coneId"]
    return {
        "type": "imu.raw",
        "payload": {
            "coneId": cone_id,
            "rollDeg": float(raw.get("roll", 0)),
            "pitchDeg": float(raw.get("pitch", 0)),
            "yawDeg": float(raw.get("yaw", 0)),
            "ax": raw.get("ax"),
            "ay": raw.get("ay"),
            "az": raw.get("az"),
            "gx": raw.get("gx"),
            "gy": raw.get("gy"),
            "gz": raw.get("gz"),
            "calibrated": raw.get("imu_calibrated", True),
            "timestamp": raw.get("ts") or _now_ms(),
        },
    }


def build_tilt_status(raw: dict[str, Any]) -> dict[str, Any]:
    """构建 tilt.status 消息。"""
    cone_id = raw["coneId"]
    roll = float(raw.get("roll", 0))
    pitch = float(raw.get("pitch", 0))
    tilt_angle = float(raw.get("tilt_angle", max(abs(roll), abs(pitch))))
    fallen = bool(raw.get("fallen", tilt_angle > 55))
    return {
        "type": "tilt.status",
        "payload": {
            "coneId": cone_id,
            "fallen": fallen,
            "angleDeg": tilt_angle,
            "thresholdDeg": float(raw.get("tilt_threshold", 55)),
            "debounceMs": int(raw.get("tilt_debounce", 600)),
            "calibration": raw.get("tilt_calibration", "zero_bias_ok"),
            "timestamp": raw.get("ts") or _now_ms(),
        },
    }


def build_gateway_status(
    *,
    status: str = "running",
    tcp_connections: int = 0,
    ws_connections: int = 0,
    latency_ms: float | None = None,
) -> dict[str, Any]:
    """构建 gateway.status 消息。"""
    payload: dict[str, Any] = {
        "status": status,
        "tcpConnections": tcp_connections,
        "wsConnections": ws_connections,
    }
    if latency_ms is not None:
        payload["latencyMs"] = latency_ms
    return {"type": "gateway.status", "payload": payload}


# ---------------------------------------------------------------------------
# 上位机 → 下位机 消息构建 (TCP 下行)
# ---------------------------------------------------------------------------


def build_waypoints_command(
    cone_id: str,
    waypoints: list[tuple[float, float]],
    step_meters: float = 2.0,
) -> dict[str, Any]:
    """构建 path.waypoints 指令，下发给下位机跟踪。"""
    return {
        "type": "path.waypoints",
        "coneId": cone_id,
        "waypoints": [{"lng": lng, "lat": lat} for lng, lat in waypoints],
        "stepMeters": step_meters,
    }


def build_route_status(cone_id: str, status: str, remaining: int = 0) -> dict[str, Any]:
    """构建 route.status 消息，通知前端路径跟踪进度。"""
    return {
        "type": "route.status",
        "payload": {
            "coneId": cone_id,
            "status": status,  # "active" / "completed" / "cancelled"
            "remaining": remaining,
        },
    }


# ---------------------------------------------------------------------------
# 上位机 → 前端 消息构建 (WebSocket 下行)
# ---------------------------------------------------------------------------


def build_route_plan(cone_id: str, waypoints: list[tuple[float, float]]) -> dict[str, Any]:
    """构建 route.plan 消息，前端 renderRoute() 展示路径折线。"""
    polyline = [{"lng": lng, "lat": lat} for lng, lat in waypoints]
    # 前端期望 payload.polyline
    return {
        "type": "route.plan",
        "payload": {
            "coneId": cone_id,
            "polyline": polyline,
        },
    }


# ---------------------------------------------------------------------------
# 消息路由 — 根据下位机 type 字段分派构建
# ---------------------------------------------------------------------------

# 路由表：下位机 type → 构建函数列表（一次数据可能触发多条前端消息）
_ROUTE_MAP: dict[str, list] = {
    "telemetry": [build_telemetry],
    "gps": [build_gps_position],
    "uwb": [build_uwb_position],
    "imu": [build_imu_raw],
    "tilt": [build_tilt_status],
}


def build_messages(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """根据下位机数据的 type 字段，构建对应的前端 WebSocket 消息列表。

    未知 type 默认走 telemetry 构建。
    """
    msg_type = raw.get("type", "telemetry")
    builders = _ROUTE_MAP.get(msg_type)
    if builders is None:
        logger.info("未知下位机消息类型 '%s'，回退为 telemetry 处理", msg_type)
        builders = [build_telemetry]

    messages: list[dict[str, Any]] = []
    for build in builders:
        try:
            msg = build(raw)
            if msg is not None:
                messages.append(msg)
        except Exception:
            logger.exception("构建消息失败: type=%s, coneId=%s", msg_type, raw.get("coneId"))
    return messages


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _now_ms() -> int:
    return int(_time.time() * 1000)


def _derive_mode(raw: dict[str, Any]) -> str:
    """根据数据推导路锥工作模式（预留扩展）。"""
    if "mode" in raw:
        return str(raw["mode"])
    return "STANDBY_DIM"
