from __future__ import annotations

from datetime import datetime
import re

from fastapi import APIRouter, Depends, Query, Request
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis_client
from app.core.enums import RouteMode
from app.core.exceptions import AppError
from app.core.responses import success_response
from app.schemas.route import LocationSuggestion, RoutePoint, RoutePreviewResponse, RouteRecommendationItem
from app.services.geocoding import GeocodingService
from app.services.recommendation import MultiCriteriaRecommendationService
from app.services.routing import RoutePoint as RoutingPoint
from app.services.routing import RouteService

router = APIRouter(prefix="/routes", tags=["Routes"])


def _try_parse_coordinates(raw: str) -> RoutingPoint | None:
    try:
        lat_str, lon_str = raw.split(",", 1)
        lat = float(lat_str.strip())
        lon = float(lon_str.strip())
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        return RoutingPoint(lat=lat, lon=lon)
    except Exception:
        return None


async def _resolve_point(raw: str, geocoding_service: GeocodingService) -> RoutingPoint:
    parsed = _try_parse_coordinates(raw)
    if parsed is not None:
        return parsed

    geocoded, _ = await geocoding_service.geocode_with_cache(raw)
    if geocoded is not None:
        return RoutingPoint(lat=geocoded.lat, lon=geocoded.lon)

    raise AppError(code="location_not_found", message=f"Unable to resolve location: {raw}", status_code=422)


def _query_variants(query: str, home_location_text: str | None) -> list[str]:
    cleaned = query.strip()
    if not cleaned:
        return []

    if not home_location_text:
        return [cleaned]

    home = home_location_text.strip()
    if not home:
        return [cleaned]

    lower = cleaned.lower()
    if home.lower() in lower:
        return [cleaned]

    has_location_marker = bool(
        re.search(
            r"\b(г\.?|город|обл\.?|область|район|улиц|ул\.|проспект|пр-кт|переул|пер\.|дом|д\.)\b",
            lower,
        )
    )
    token_count = len([token for token in lower.split() if token])

    contextual = f"{cleaned}, {home}"
    if has_location_marker or token_count >= 3:
        return [cleaned, contextual]
    return [contextual, cleaned]


def _suggestion_key(item) -> tuple[float, float]:
    return round(item.lat, 5), round(item.lon, 5)


@router.get("/locations/suggest")
async def location_suggest(
    request: Request,
    q: str = Query(min_length=2),
    limit: int = Query(default=8, ge=1, le=15),
    current_user=Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    service = GeocodingService(redis)
    variants = _query_variants(q, getattr(current_user, "home_location_text", None))
    merged = []
    seen: set[tuple[float, float]] = set()
    for variant in variants:
        suggestions = await service.suggest_with_cache(variant, limit=limit)
        for item in suggestions:
            key = _suggestion_key(item)
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                break
        if len(merged) >= limit:
            break

    data = [
        LocationSuggestion(
            title=item.title,
            subtitle=item.subtitle,
            lat=item.lat,
            lon=item.lon,
        ).model_dump()
        for item in merged
    ]
    return success_response(data=data, request=request)


@router.get("/locations/reverse")
async def location_reverse(
    request: Request,
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    current_user=Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    service = GeocodingService(redis)
    label = await service.reverse_with_cache(lat, lon)
    return success_response(data={"label": label, "lat": lat, "lon": lon}, request=request)


@router.get("/preview")
async def route_preview(
    request: Request,
    from_raw: str = Query(alias="from"),
    to_raw: str = Query(alias="to"),
    mode: RouteMode = Query(default=RouteMode.PUBLIC_TRANSPORT),
    departure_at: datetime | None = Query(default=None),
    current_user=Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    geocoding_service = GeocodingService(redis)
    from_point = await _resolve_point(from_raw, geocoding_service)
    to_point = await _resolve_point(to_raw, geocoding_service)

    service = RouteService(redis)
    route = await service.get_route_preview(from_point=from_point, to_point=to_point, mode=mode, departure=departure_at)
    data = RoutePreviewResponse(
        mode=route.mode,
        duration_sec=route.duration_sec,
        distance_m=route.distance_m,
        from_point=RoutePoint(lat=from_point.lat, lon=from_point.lon),
        to_point=RoutePoint(lat=to_point.lat, lon=to_point.lon),
        geometry=route.geometry,
        steps=route.steps,
    )
    return success_response(data=data.model_dump(), request=request)


@router.get("/recommendations")
async def route_recommendations(
    request: Request,
    from_raw: str = Query(alias="from"),
    to_raw: str = Query(alias="to"),
    mode: RouteMode | None = Query(default=None),
    modes: list[RouteMode] | None = Query(default=None),
    departure_at: datetime | None = Query(default=None),
    current_user=Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    geocoding_service = GeocodingService(redis)
    from_point = await _resolve_point(from_raw, geocoding_service)
    to_point = await _resolve_point(to_raw, geocoding_service)

    selected_modes = modes or ([mode] if mode else [RouteMode.WALKING, RouteMode.PUBLIC_TRANSPORT, RouteMode.DRIVING, RouteMode.BICYCLE])

    route_service = RouteService(redis)
    routes = await route_service.get_routes_for_modes(from_point, to_point, selected_modes, departure=departure_at)

    rec_service = MultiCriteriaRecommendationService()
    ranked = rec_service.rank(routes)
    data = [
        RouteRecommendationItem(
            mode=item.mode,
            duration_sec=item.duration_sec,
            distance_m=item.distance_m,
            estimated_cost=item.estimated_cost,
            score=item.score,
            reason=item.reason,
        ).model_dump()
        for item in ranked
    ]
    return success_response(data=data, request=request)


@router.get("/config")
async def routes_config(
    request: Request,
    current_user=Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    data = RouteService(redis).frontend_maps_config()
    return success_response(data=data, request=request)
