"""Small utilities shared by agents."""

from __future__ import annotations

import math
import re
from typing import Iterable, Mapping


def clean_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def row_get(row: Mapping[str, object], key: str, default: object = "") -> object:
    try:
        return row.get(key, default)
    except AttributeError:
        return getattr(row, key, default)


def combined_text(row: Mapping[str, object], columns: Iterable[str]) -> str:
    parts = [clean_text(row_get(row, c)) for c in columns]
    return " | ".join(part for part in parts if part)


def to_float(value: object, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        number = float(value)
        if math.isnan(number):
            return default
        return number
    except (TypeError, ValueError):
        return default


def to_int(value: object, default: int = 0) -> int:
    number = to_float(value)
    if number is None:
        return default
    return int(number)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c
