from __future__ import annotations

import abc
import asyncio
import json
import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.enums import RouteMode

logger = logging.getLogger(__name__)


def _safe_float(value: Any) -> float | None:
    try:
        result = float(value)
    except Exception:
        return None
    if not math.isfinite(result):
        return None
    return result


def _is_valid_lat_lon(lat: float, lon: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lon <= 180


def _pair_to_latlon(pair: Any) -> list[float] | None:
    if not isinstance(pair, (list, tuple)) or len(pair) < 2:
        return None
    a = _safe_float(pair[0])
    b = _safe_float(pair[1])
    if a is None or b is None:
        return None

    if abs(a) > 90 and abs(b) <= 90 and _is_valid_lat_lon(b, a):
        return [b, a]  # [lon, lat] -> [lat, lon]
    if abs(b) > 90 and abs(a) <= 90 and _is_valid_lat_lon(a, b):
        return [a, b]  # already [lat, lon]

    # Ambiguous values (both look like valid latitudes): prefer [lon, lat] -> [lat, lon]
    if _is_valid_lat_lon(b, a):
        return [b, a]
    if _is_valid_lat_lon(a, b):
        return [a, b]
    return None


def _parse_wkt_linestring_to_latlon(value: str) -> list[list[float]]:
    match = re.search(r"LINESTRING\s*\((.+)\)", value, flags=re.IGNORECASE)
    if not match:
        return []

    points: list[list[float]] = []
    for chunk in match.group(1).split(","):
        parts = [part for part in chunk.strip().split() if part]
        if len(parts) < 2:
            continue
        lon = _safe_float(parts[0])
        lat = _safe_float(parts[1])
        if lon is None or lat is None:
            continue
        if _is_valid_lat_lon(lat, lon):
            points.append([lat, lon])
    return points


def _geometry_to_latlon(geometry: Any, from_point: "RoutePoint" | None = None, to_point: "RoutePoint" | None = None) -> list[list[float]] | None:
    if geometry is None:
        if from_point is None or to_point is None:
            return None
        return [[from_point.lat, from_point.lon], [to_point.lat, to_point.lon]]

    raw_coords: Any = None
    if isinstance(geometry, str):
        parsed = _parse_wkt_linestring_to_latlon(geometry)
        if len(parsed) >= 2:
            return parsed
        if from_point is None or to_point is None:
            return None
        return [[from_point.lat, from_point.lon], [to_point.lat, to_point.lon]]
    if isinstance(geometry, list):
        raw_coords = geometry
    elif isinstance(geometry, dict):
        if isinstance(geometry.get("coordinates"), list):
            raw_coords = geometry.get("coordinates")
        elif geometry.get("type") == "Feature" and isinstance(geometry.get("geometry"), dict):
            raw_coords = geometry["geometry"].get("coordinates")

    if not isinstance(raw_coords, list):
        if from_point is None or to_point is None:
            return None
        return [[from_point.lat, from_point.lon], [to_point.lat, to_point.lon]]

    parsed_points: list[list[float]] = []
    for item in raw_coords:
        point = _pair_to_latlon(item)
        if point is None:
            continue
        parsed_points.append(point)

    if len(parsed_points) >= 2:
        return parsed_points
    if from_point is None or to_point is None:
        return None
    return [[from_point.lat, from_point.lon], [to_point.lat, to_point.lon]]


@dataclass(slots=True)
class RoutePoint:
    lat: float
    lon: float


@dataclass(slots=True)
class RouteResult:
    mode: RouteMode
    duration_sec: int
    distance_m: int
    geometry: Any | None = None
    geometry_latlon: list[list[float]] | None = None
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
        geometry = [[from_point.lon, from_point.lat], [to_point.lon, to_point.lat]]
        return RouteResult(
            mode=mode,
            duration_sec=max(duration, 60),
            distance_m=max(distance, 1),
            geometry=geometry,
            geometry_latlon=[[from_point.lat, from_point.lon], [to_point.lat, to_point.lon]],
            steps=[],
        )


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
                route = (payload.get("routes") or [{}])[0] if isinstance(payload, dict) else {}
                legs = route.get("legs") or [{}]
                summary = (legs[0] or {}).get("summary", {}) if isinstance(legs, list) and legs else {}
                distance = int(summary.get("length", 0))
                duration = int(summary.get("duration", 0))
                geometry = route.get("geometry")
                return RouteResult(
                    mode=mode,
                    duration_sec=max(duration, 60),
                    distance_m=max(distance, 1),
                    geometry=geometry,
                    geometry_latlon=_geometry_to_latlon(geometry, from_point, to_point),
                    steps=((legs[0] or {}).get("steps", []) if isinstance(legs, list) and legs else []),
                )
            except Exception as exc:  # pragma: no cover - network dependent
                last_error = exc
                logger.warning(
                    "Yandex route request failed",
                    extra={"attempt": attempt + 1, "retries": self.retries, "mode": mode.value, "error": str(exc)},
                )
                if attempt + 1 < self.retries:
                    await asyncio.sleep(self.backoff * (2**attempt))
        raise RuntimeError(f"Yandex route API failed: {last_error}")


class OpenRouteServiceRouteProvider(RouteProvider):
    def __init__(
        self,
        api_key: str,
        *,
        timeout_sec: int = 8,
        retries: int = 3,
        backoff: float = 0.5,
        public_transport_fallback: RouteProvider | None = None,
    ) -> None:
        self.api_key = api_key
        self.timeout_sec = timeout_sec
        self.retries = retries
        self.backoff = backoff
        self.public_transport_fallback = public_transport_fallback
        self._base_url = "https://api.openrouteservice.org/v2/directions"

    @staticmethod
    def _profile(mode: RouteMode) -> str | None:
        mapping = {
            RouteMode.DRIVING: "driving-car",
            RouteMode.WALKING: "foot-walking",
            RouteMode.BICYCLE: "cycling-regular",
        }
        return mapping.get(mode)

    @staticmethod
    def _extract_steps(feature: dict[str, Any]) -> list[dict]:
        properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
        segments = properties.get("segments")
        if not isinstance(segments, list):
            return []
        steps: list[dict] = []
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            raw_steps = segment.get("steps")
            if not isinstance(raw_steps, list):
                continue
            for item in raw_steps:
                if isinstance(item, dict):
                    steps.append(item)
        return steps

    async def get_route(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        if mode == RouteMode.PUBLIC_TRANSPORT:
            if self.public_transport_fallback is None:
                raise RuntimeError("OpenRouteService does not support public transport and no fallback is configured")
            logger.info("ORS provider falling back for public transport mode")
            return await self.public_transport_fallback.get_route(from_point, to_point, mode, departure)

        profile = self._profile(mode)
        if not profile:
            raise RuntimeError(f"Unsupported ORS route mode: {mode.value}")

        url = f"{self._base_url}/{profile}/geojson"
        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
        }
        body = {
            "coordinates": [[from_point.lon, from_point.lat], [to_point.lon, to_point.lat]],
            "instructions": True,
        }

        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                    response = await client.post(url, headers=headers, json=body)
                response.raise_for_status()
                payload = response.json()
                feature = {}
                if isinstance(payload, dict):
                    features = payload.get("features")
                    if isinstance(features, list) and features:
                        feature = features[0] if isinstance(features[0], dict) else {}
                    elif payload.get("type") == "Feature":
                        feature = payload

                geometry_obj = feature.get("geometry", {}) if isinstance(feature, dict) else {}
                coordinates = geometry_obj.get("coordinates") if isinstance(geometry_obj, dict) else None
                properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
                summary = properties.get("summary", {}) if isinstance(properties, dict) else {}
                distance = int(round(float(summary.get("distance", 0) or 0)))
                duration = int(round(float(summary.get("duration", 0) or 0)))
                geometry_latlon = _geometry_to_latlon(coordinates, from_point, to_point)

                return RouteResult(
                    mode=mode,
                    duration_sec=max(duration, 60),
                    distance_m=max(distance, 1),
                    geometry=coordinates,
                    geometry_latlon=geometry_latlon,
                    steps=self._extract_steps(feature),
                )
            except Exception as exc:  # pragma: no cover - network dependent
                last_error = exc
                logger.warning(
                    "ORS route request failed",
                    extra={"attempt": attempt + 1, "retries": self.retries, "mode": mode.value, "error": str(exc)},
                )
                if attempt + 1 < self.retries:
                    await asyncio.sleep(self.backoff * (2**attempt))
        raise RuntimeError(f"OpenRouteService API failed: {last_error}")


class RouteService:
    def __init__(self, redis: Redis, provider: RouteProvider | None = None) -> None:
        settings = get_settings()
        self.settings = settings
        self.redis = redis
        self.provider: RouteProvider
        self._provider_chain: list[RouteProvider]

        if provider is not None:
            self.provider = provider
            self._provider_chain = [provider]
            return

        mock_provider = MockRouteProvider()
        yandex_provider = (
            YandexRouteProvider(
                api_key=settings.yandex_router_api_key,
                timeout_sec=settings.route_request_timeout_sec,
                retries=settings.route_retry_attempts,
                backoff=settings.route_retry_backoff_sec,
            )
            if settings.yandex_router_api_key
            else None
        )
        ors_provider = (
            OpenRouteServiceRouteProvider(
                api_key=settings.openrouteservice_api_key,
                timeout_sec=settings.route_request_timeout_sec,
                retries=settings.route_retry_attempts,
                backoff=settings.route_retry_backoff_sec,
                public_transport_fallback=yandex_provider or mock_provider,
            )
            if settings.openrouteservice_api_key
            else None
        )

        if ors_provider is not None:
            self.provider = ors_provider
            self._provider_chain = [ors_provider]
            if yandex_provider is not None:
                self._provider_chain.append(yandex_provider)
            self._provider_chain.append(mock_provider)
        elif yandex_provider is not None:
            self.provider = yandex_provider
            self._provider_chain = [yandex_provider, mock_provider]
        else:
            self.provider = mock_provider
            self._provider_chain = [mock_provider]

    @staticmethod
    def _cache_key(mode: RouteMode, from_point: RoutePoint, to_point: RoutePoint, departure: datetime | None) -> str:
        departure_dt = departure or datetime.now(timezone.utc)
        bucket = int(departure_dt.timestamp() // 300)
        return (
            f"route:{mode.value}:{from_point.lat:.5f},{from_point.lon:.5f}:"
            f"{to_point.lat:.5f},{to_point.lon:.5f}:{bucket}"
        )

    @staticmethod
    def _ensure_geometry_latlon(route: RouteResult, from_point: RoutePoint, to_point: RoutePoint) -> RouteResult:
        if route.geometry_latlon and len(route.geometry_latlon) >= 2:
            return route
        route.geometry_latlon = _geometry_to_latlon(route.geometry, from_point, to_point)
        return route

    @staticmethod
    def _deserialize_cached_route(payload: dict[str, Any], from_point: RoutePoint, to_point: RoutePoint) -> RouteResult:
        route = RouteResult(
            mode=RouteMode(payload["mode"]),
            duration_sec=int(payload["duration_sec"]),
            distance_m=int(payload["distance_m"]),
            geometry=payload.get("geometry"),
            geometry_latlon=payload.get("geometry_latlon"),
            steps=payload.get("steps"),
        )
        return RouteService._ensure_geometry_latlon(route, from_point, to_point)

    async def _get_route_with_runtime_fallback(
        self,
        from_point: RoutePoint,
        to_point: RoutePoint,
        mode: RouteMode,
        departure: datetime | None = None,
    ) -> RouteResult:
        last_error: Exception | None = None
        for index, provider in enumerate(self._provider_chain):
            try:
                route = await provider.get_route(from_point, to_point, mode, departure)
                return self._ensure_geometry_latlon(route, from_point, to_point)
            except Exception as exc:  # pragma: no cover - network dependent
                last_error = exc
                if index + 1 < len(self._provider_chain):
                    logger.warning(
                        "Route provider failed, trying fallback",
                        extra={
                            "provider": provider.__class__.__name__,
                            "fallback_provider": self._provider_chain[index + 1].__class__.__name__,
                            "mode": mode.value,
                            "error": str(exc),
                        },
                    )
                else:
                    logger.error(
                        "Route provider failed and no fallbacks remain",
                        extra={"provider": provider.__class__.__name__, "mode": mode.value, "error": str(exc)},
                    )
        raise RuntimeError(f"All route providers failed: {last_error}")

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
            return self._deserialize_cached_route(payload, from_point, to_point)

        route = await self._get_route_with_runtime_fallback(from_point, to_point, mode, departure)
        cache_payload = {
            "mode": route.mode.value,
            "duration_sec": route.duration_sec,
            "distance_m": route.distance_m,
            "geometry": route.geometry,
            "geometry_latlon": route.geometry_latlon,
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

