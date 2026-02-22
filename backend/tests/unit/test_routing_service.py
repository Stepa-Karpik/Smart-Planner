from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

from app.core.enums import RouteMode
from app.services.routing import RoutePoint, RouteResult, RouteService


class FakeRedis:
    def __init__(self) -> None:
        self.storage: dict[str, str] = {}

    async def get(self, key: str):
        return self.storage.get(key)

    async def setex(self, key: str, _ttl: int, value: str) -> None:
        self.storage[key] = value


@dataclass
class FakeProvider:
    route: RouteResult
    calls: int = 0

    async def get_route(self, from_point: RoutePoint, to_point: RoutePoint, mode: RouteMode, departure=None) -> RouteResult:
        self.calls += 1
        return self.route


class FailingProvider:
    def __init__(self) -> None:
        self.calls = 0

    async def get_route(self, from_point: RoutePoint, to_point: RoutePoint, mode: RouteMode, departure=None) -> RouteResult:
        self.calls += 1
        raise RuntimeError("provider failed")


def _new_service(redis: FakeRedis, chain) -> RouteService:
    service = RouteService.__new__(RouteService)
    service.redis = redis
    service.settings = type("S", (), {"routes_cache_ttl_sec": 900})()
    service.provider = chain[0]
    service._provider_chain = list(chain)
    return service


@pytest.mark.asyncio
async def test_route_service_populates_geometry_latlon_for_client():
    redis = FakeRedis()
    provider = FakeProvider(
        route=RouteResult(
            mode=RouteMode.DRIVING,
            duration_sec=600,
            distance_m=5000,
            geometry=[[37.618423, 55.751244], [37.620000, 55.760000]],  # [lon, lat]
            steps=[],
        )
    )
    service = _new_service(redis, [provider])
    from_point = RoutePoint(lat=55.751244, lon=37.618423)
    to_point = RoutePoint(lat=55.760000, lon=37.620000)

    result = await service.get_route_preview(from_point, to_point, RouteMode.DRIVING, departure=datetime.now(timezone.utc))

    assert result.geometry_latlon is not None
    assert len(result.geometry_latlon) >= 2
    lat, lon = result.geometry_latlon[0]
    assert -90 <= lat <= 90
    assert -180 <= lon <= 180

    cached_payload = json.loads(next(iter(redis.storage.values())))
    assert "geometry_latlon" in cached_payload
    assert isinstance(cached_payload["geometry_latlon"], list)


@pytest.mark.asyncio
async def test_route_service_runtime_fallback_uses_next_provider():
    redis = FakeRedis()
    failing = FailingProvider()
    fallback = FakeProvider(
        route=RouteResult(
            mode=RouteMode.WALKING,
            duration_sec=300,
            distance_m=1000,
            geometry=[[37.0, 55.0], [37.01, 55.01]],
            steps=[],
        )
    )
    service = _new_service(redis, [failing, fallback])
    from_point = RoutePoint(lat=55.0, lon=37.0)
    to_point = RoutePoint(lat=55.01, lon=37.01)

    result = await service.get_route_preview(from_point, to_point, RouteMode.WALKING)

    assert result.duration_sec == 300
    assert failing.calls == 1
    assert fallback.calls == 1
    assert result.geometry_latlon is not None

