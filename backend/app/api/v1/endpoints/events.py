from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.enums import EventStatus
from app.core.responses import success_response
from app.schemas.event import EventCreate, EventRead, EventUpdate
from app.services.events import EventService

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("")
async def list_events(
    request: Request,
    from_dt: datetime | None = Query(default=None, alias="from"),
    to_dt: datetime | None = Query(default=None, alias="to"),
    calendar_id: UUID | None = None,
    status_filter: EventStatus | None = Query(default=None, alias="status"),
    q: str | None = None,
    limit: int | None = Query(default=100, ge=1, le=500),
    offset: int | None = Query(default=0, ge=0),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = EventService(session, redis)
    items, total = await service.list_events(
        user_id=current_user.id,
        from_dt=from_dt,
        to_dt=to_dt,
        calendar_id=calendar_id,
        status=status_filter,
        q=q,
        limit=limit,
        offset=offset,
    )
    data = [EventRead.model_validate(item).model_dump() for item in items]
    pagination = None
    if limit is not None and offset is not None:
        pagination = {"limit": limit, "offset": offset, "total": total}
    return success_response(data=data, request=request, pagination=pagination)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    item = await EventService(session, redis).create_event(current_user.id, payload)
    return success_response(data=EventRead.model_validate(item).model_dump(), request=request)


@router.get("/{event_id}")
async def get_event(
    event_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    item = await EventService(session, redis).get_event(current_user.id, event_id)
    return success_response(data=EventRead.model_validate(item).model_dump(), request=request)


@router.patch("/{event_id}")
async def update_event(
    event_id: UUID,
    payload: EventUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    item = await EventService(session, redis).update_event(current_user.id, event_id, payload)
    return success_response(data=EventRead.model_validate(item).model_dump(), request=request)


@router.delete("/{event_id}")
async def delete_event(
    event_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    await EventService(session, redis).soft_delete_event(current_user.id, event_id)
    return success_response(data={"ok": True}, request=request)
