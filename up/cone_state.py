"""
路锥状态管理 — 跟踪每个路锥的当前位置、目标位置和规划路径。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ConeState:
    """单个路锥的运行时状态。"""

    __slots__ = (
        "cone_id",
        "current_lng",
        "current_lat",
        "target_lng",
        "target_lat",
        "planned_path",
        "path_index",
        "battery",
        "mode",
        "online",
        "last_seen_ms",
    )

    def __init__(self, cone_id: str) -> None:
        self.cone_id = cone_id
        self.current_lng: float | None = None
        self.current_lat: float | None = None
        self.target_lng: float | None = None
        self.target_lat: float | None = None
        self.planned_path: list[tuple[float, float]] | None = None
        self.path_index: int = 0
        self.battery: float = 100.0
        self.mode: str = "STANDBY_DIM"
        self.online: bool = False
        self.last_seen_ms: int = 0

    @property
    def has_current(self) -> bool:
        return self.current_lng is not None and self.current_lat is not None

    @property
    def has_target(self) -> bool:
        return self.target_lng is not None and self.target_lat is not None

    @property
    def has_active_path(self) -> bool:
        return (
            self.planned_path is not None
            and self.path_index < len(self.planned_path)
        )

    def current_position(self) -> tuple[float, float] | None:
        if not self.has_current:
            return None
        return (self.current_lng, self.current_lat)  # type: ignore[return-value]

    def target_position(self) -> tuple[float, float] | None:
        if not self.has_target:
            return None
        return (self.target_lng, self.target_lat)  # type: ignore[return-value]

    def next_waypoint(self) -> tuple[float, float] | None:
        """获取下一个路点，并推进索引。"""
        if not self.has_active_path:
            return None
        wp = self.planned_path[self.path_index]  # type: ignore[index]
        self.path_index += 1
        return wp

    def path_remaining(self) -> int:
        """剩余路点数量。"""
        if self.planned_path is None:
            return 0
        return max(0, len(self.planned_path) - self.path_index)

    def clear_path(self) -> None:
        self.planned_path = None
        self.path_index = 0

    def update_position(self, lng: float, lat: float) -> None:
        self.current_lng = lng
        self.current_lat = lat

    def update_from_telemetry(self, data: dict[str, Any]) -> None:
        """从下位机 telemetry 数据更新状态。"""
        self.current_lng = float(data["lng"])
        self.current_lat = float(data["lat"])
        self.online = bool(data.get("online", True))
        self.battery = float(data.get("battery", self.battery))
        self.mode = data.get("mode", self.mode)
        self.last_seen_ms = int(data.get("ts", 0))


class StateManager:
    """管理所有路锥的运行时状态。"""

    def __init__(self) -> None:
        self._cones: dict[str, ConeState] = {}

    def get(self, cone_id: str) -> ConeState:
        """获取或创建路锥状态。"""
        if cone_id not in self._cones:
            self._cones[cone_id] = ConeState(cone_id)
        return self._cones[cone_id]

    def update_telemetry(self, data: dict[str, Any]) -> ConeState:
        """用下位机 telemetry 更新状态并返回。"""
        cone = self.get(data["coneId"])
        cone.update_from_telemetry(data)
        return cone

    def set_target(self, cone_id: str, lng: float, lat: float) -> ConeState:
        """设置路锥的目标位置。"""
        cone = self.get(cone_id)
        cone.target_lng = lng
        cone.target_lat = lat
        return cone

    def set_path(self, cone_id: str, path: list[tuple[float, float]]) -> ConeState:
        """为路锥设置规划路径。"""
        cone = self.get(cone_id)
        cone.planned_path = path
        cone.path_index = 0
        return cone

    def clear_path(self, cone_id: str) -> None:
        cone = self.get(cone_id)
        cone.clear_path()

    @property
    def cone_ids(self) -> list[str]:
        return list(self._cones.keys())
