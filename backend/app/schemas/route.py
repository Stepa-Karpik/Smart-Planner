from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.core.enums import RouteMode


class RoutePoint(BaseModel):
    lat: float
    lon: float


class LocationSuggestion(BaseModel):
    title: str
    subtitle: str | None = None
    lat: float
    lon: float


class RoutePreviewResponse(BaseModel):
    mode: RouteMode
    duration_sec: int
    distance_m: int
    from_point: RoutePoint
    to_point: RoutePoint
    geometry: Any | None = None
    geometry_latlon: list[list[float]] | None = None
    steps: list[dict] | None = None


class RouteRecommendationItem(BaseModel):
    mode: RouteMode
    duration_sec: int
    distance_m: int
    estimated_cost: float
    score: float
    reason: str
