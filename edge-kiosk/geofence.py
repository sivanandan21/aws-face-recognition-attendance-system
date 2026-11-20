"""
Geo-fencing validation module.
Preserves and optimizes the original repository's VIT Vellore coordinates
and Haversine distance calculations.
"""

import math
from typing import Tuple
from config import config


def haversine_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """
    Calculate the great circle distance between two points on the Earth
    in meters using the Haversine formula.
    """
    radius_earth_meters = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return radius_earth_meters * c


def is_inside_campus(
    user_lat: float,
    user_lon: float,
    campus_lat: float = config.vit_latitude,
    campus_lon: float = config.vit_longitude,
    allowed_radius: float = config.allowed_radius_meters,
) -> Tuple[bool, float]:
    """
    Check if coordinates fall within the authorized campus perimeter.
    Returns (is_valid, distance_in_meters).
    """
    distance = haversine_distance_meters(user_lat, user_lon, campus_lat, campus_lon)
    return distance <= allowed_radius, distance
