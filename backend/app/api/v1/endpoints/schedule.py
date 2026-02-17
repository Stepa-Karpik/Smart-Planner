from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.enums import RouteMode
from app.core.responses import success_response
from app.schemas.schedule import FeasibilityResponse
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.routing import RouteService

router = APIRouter(prefix="/schedule", tags=["Schedule"])


@router.get("/feasibility")
async def feasibility(
    request: Request,
    from_dt: datetime = Query(alias="from"),
    to_dt: datetime = Query(alias="to"),
    mode: RouteMode = Query(default=RouteMode.PUBLIC_TRANSPORT),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    event_service = EventService(session, redis)
    route_service = RouteService(redis)
    feasibility_service = TravelFeasibilityService(route_service)

    events = await event_service.list_events_range(current_user.id, from_dt, to_dt)
    conflicts = await feasibility_service.check(events, mode=mode)
    payload = FeasibilityResponse(conflicts=[asdict(item) for item in conflicts])
    return success_response(data=payload.model_dump(), request=request)
