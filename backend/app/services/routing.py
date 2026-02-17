from __future__ import annotations

import abc
import asyncio
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.enums import RouteMode


@dataclass(slots=True)
class RoutePoint:
    lat: float
    lon: float


@dataclass(slots=True)
class RouteResult:
    mode: RouteMode
    duration_sec: int
    distance_m: int
    geometry: list[list[float]] | None = None
    steps: list[dict] | None = None


class RouteProvider(abc.ABC):
    @abc.abstractmethod
    async def get_route(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        raise NotImplementedError

    async def get_matrix(
        self,
        from_points: list[RoutePoint],
        to_points: list[RoutePoint],
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> list[list[RouteResult]]:
        matrix: list[list[RouteResult]] = []
        for from_point in from_points:
            row: list[RouteResult] = []
            for to_point in to_points:
                row.append(await self.get_route(from_point, to_point, mode, departure))
            matrix.append(row)
        return matrix


class MockRouteProvider(RouteProvider):
    _speed_m_s = {
        RouteMode.WALKING: 1.3,
        RouteMode.PUBLIC_TRANSPORT: 6.0,
        RouteMode.DRIVING: 11.0,
        RouteMode.BICYCLE: 4.5,
    }

    @staticmethod
    def _haversine_distance(a: RoutePoint, b: RoutePoint) -> float:
        r = 6_371_000
        lat1 = math.radians(a.lat)
        lat2 = math.radians(b.lat)
        d_lat = lat2 - lat1
        d_lon = math.radians(b.lon - a.lon)

        x = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
        return 2 * r * math.asin(math.sqrt(x))

    async def get_route(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        distance = int(self._haversine_distance(from_point, to_point))
        speed = self._speed_m_s.get(mode, 4.0)
        duration = int(distance / speed) if distance > 0 else 60
        return RouteResult(mode=mode, duration_sec=max(duration, 60), distance_m=distance, geometry=[[from_point.lon, from_point.lat], [to_point.lon, to_point.lat]], steps=[])


class YandexRouteProvider(RouteProvider):
    def __init__(self, api_key: str, timeout_sec: int = 8, retries: int = 3, backoff: float = 0.5) -> None:
        self.api_key = api_key
        self.timeout_sec = timeout_sec
        self.retries = retries
        self.backoff = backoff
        self._base_url = "https://api.routing.yandex.net/v2/route"

    def _vehicle_type(self, mode: RouteMode) -> str:
        mapping = {
            RouteMode.WALKING: "pedestrian",
            RouteMode.DRIVING: "auto",
            RouteMode.PUBLIC_TRANSPORT: "masstransit",
            RouteMode.BICYCLE: "bicycle",
        }
        return mapping.get(mode, "auto")

    async def get_route(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        params = {
            "apikey": self.api_key,
            "waypoints": f"{from_point.lon},{from_point.lat}|{to_point.lon},{to_point.lat}",
            "mode": self._vehicle_type(mode),
            "lang": "ru_RU",
        }
        if departure:
            params["departure_time"] = int(departure.timestamp())

        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                    response = await client.get(self._base_url, params=params)
                response.raise_for_status()
                payload = response.json()
                route = payload.get("routes", [{}])[0]
                summary = route.get("legs", [{}])[0].get("summary", {})
                distance = int(summary.get("length", 0))
                duration = int(summary.get("duration", 0))
                geometry = route.get("geometry")
                return RouteResult(
                    mode=mode,
                    duration_sec=max(duration, 60),
                    distance_m=max(distance, 1),
                    geometry=geometry,
                    steps=route.get("legs", [{}])[0].get("steps", []),
                )
            except Exception as exc:  # pragma: no cover - network dependent
                last_error = exc
                if attempt + 1 < self.retries:
                    await asyncio.sleep(self.backoff * (2**attempt))
        raise RuntimeError(f"Yandex route API failed: {last_error}")


class RouteService:
    def __init__(self, redis: Redis, provider: RouteProvider | None = None) -> None:
        settings = get_settings()
        self.settings = settings
        self.redis = redis
        self.provider: RouteProvider
        if provider is not None:
            self.provider = provider
        elif settings.yandex_router_api_key:
            self.provider = YandexRouteProvider(
                api_key=settings.yandex_router_api_key,
                timeout_sec=settings.route_request_timeout_sec,
                retries=settings.route_retry_attempts,
                backoff=settings.route_retry_backoff_sec,
            )
        else:
            self.provider = MockRouteProvider()

    @staticmethod
    def _cache_key(mode: RouteMode, from_point: RoutePoint, to_point: RoutePoint, departure: datetime | None) -> str:
        departure_dt = departure or datetime.now(timezone.utc)
        bucket = int(departure_dt.timestamp() // 300)
        return (
            f"route:{mode.value}:{from_point.lat:.5f},{from_point.lon:.5f}:"
            f"{to_point.lat:.5f},{to_point.lon:.5f}:{bucket}"
        )

    async def get_route_preview(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        key = self._cache_key(mode, from_point, to_point, departure)
        cached = await self.redis.get(key)
        if cached:
            payload = json.loads(cached)
            return RouteResult(
                mode=RouteMode(payload["mode"]),
                duration_sec=payload["duration_sec"],
                distance_m=payload["distance_m"],
                geometry=payload.get("geometry"),
                steps=payload.get("steps"),
            )

        route = await self.provider.get_route(from_point, to_point, mode, departure)
        cache_payload = {
            "mode": route.mode.value,
            "duration_sec": route.duration_sec,
            "distance_m": route.distance_m,
            "geometry": route.geometry,
            "steps": route.steps,
        }
        await self.redis.setex(key, self.settings.routes_cache_ttl_sec, json.dumps(cache_payload))
        return route

    async def get_routes_for_modes(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        modes: list[RouteMode],
        departure: datetime | None = None,
    ) -> list[RouteResult]:
        results: list[RouteResult] = []
        for mode in modes:
            results.append(await self.get_route_preview(from_point, to_point, mode, departure))
        return results

    def frontend_maps_config(self) -> dict:
        return {
            "api_key": self.settings.yandex_maps_api_key,
            "layers": ["traffic", "transit", "bicycle"],
        }
