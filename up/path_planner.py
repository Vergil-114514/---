"""
路径规划 — 两个 GPS 坐标之间线性插值生成密集路点。

使用 Haversine 公式计算距离和方位角，按固定步长等距插值。
"""

from __future__ import annotations

import math

# 地球半径（米）
_EARTH_RADIUS_M = 6371000.0


def haversine_distance(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """计算两个 GPS 坐标之间的距离（米）。"""
    dlng = math.radians(lng2 - lng1)
    dlat = math.radians(lat2 - lat1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return _EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """计算从点1到点2的方位角（弧度，正北为0）。"""
    dlng = math.radians(lng2 - lng1)
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    y = math.sin(dlng) * math.cos(rlat2)
    x = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlng)
    return math.atan2(y, x)


def _step_point(lng: float, lat: float, bearing_rad: float, distance_m: float) -> tuple[float, float]:
    """沿指定方位角移动 distance_m 米后的新坐标。"""
    rlat = math.radians(lat)
    rlng = math.radians(lng)
    angular_dist = distance_m / _EARTH_RADIUS_M

    new_rlat = math.asin(
        math.sin(rlat) * math.cos(angular_dist)
        + math.cos(rlat) * math.sin(angular_dist) * math.cos(bearing_rad)
    )
    new_rlng = rlng + math.atan2(
        math.sin(bearing_rad) * math.sin(angular_dist) * math.cos(rlat),
        math.cos(angular_dist) - math.sin(rlat) * math.sin(new_rlat),
    )

    return (math.degrees(new_rlng), math.degrees(new_rlat))


def plan_path(
    current_lng: float,
    current_lat: float,
    target_lng: float,
    target_lat: float,
    step_meters: float = 2.0,
) -> list[tuple[float, float]]:
    """在当前点和目标点之间生成等距路点。

    Args:
        current_lng / current_lat: 起点坐标。
        target_lng / target_lat: 终点坐标。
        step_meters: 路点间距（米），默认 2.0。

    Returns:
        路点列表 [(lng, lat), ...]，含终点，不含起点。
    """
    total_dist = haversine_distance(current_lng, current_lat, target_lng, target_lat)
    if total_dist < 0.5:
        # 距离太近，直接返回终点
        return [(target_lng, target_lat)]

    b = bearing(current_lng, current_lat, target_lng, target_lat)
    steps = max(1, int(total_dist / step_meters))
    actual_step = total_dist / steps

    waypoints: list[tuple[float, float]] = []
    cur_lng, cur_lat = current_lng, current_lat
    for _ in range(steps - 1):
        cur_lng, cur_lat = _step_point(cur_lng, cur_lat, b, actual_step)
        waypoints.append((round(cur_lng, 8), round(cur_lat, 8)))

    # 最后一个点强制等于目标
    waypoints.append((round(target_lng, 8), round(target_lat, 8)))
    return waypoints
