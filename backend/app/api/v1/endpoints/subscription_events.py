from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_redis_client
from app.core.config import get_settings
from app.core.enums import EventLocationSource, EventStatus, ReminderStatus, ReminderType
from app.core.responses import success_response
from app.models import Calendar, Event, Reminder
from app.repositories.calendar import CalendarRepository
from app.services.reminders import ReminderService

router = APIRouter(prefix="/subscription-events", tags=["Subscription Events"])


class SubscriptionEventUpsert(BaseModel):
    owner_subject_id: UUID
    calendar_title: str = Field(default="Подписки", min_length=1, max_length=255)
    external_ref: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = True
    priority: int = Field(default=1, ge=0, le=3)
    color: str = Field(default="#111111", max_length=16)
    color_dark: str = Field(default="#f5f5f5", max_length=16)
    location_text: str | None = Field(default=None, max_length=255)
    location_lat: float | None = Field(default=None, ge=-90, le=90)
    location_lon: float | None = Field(default=None, ge=-180, le=180)
    details_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_times(self):
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be greater than starts_at")
        return self


def _check_internal_key(x_internal_key: str | None) -> None:
    settings = get_settings()
    if not settings.planner_internal_api_key or x_internal_key != settings.planner_internal_api_key:
        raise HTTPException(status_code=401, detail="invalid internal key")


async def _find_event(session: AsyncSession, owner_subject_id: UUID, external_ref: str) -> Event | None:
    stmt = (
        select(Event)
        .join(Calendar, Event.calendar_id == Calendar.id)
        .where(
            Calendar.user_id == owner_subject_id,
            Event.external_source == "subs",
            Event.external_ref == external_ref,
        )
        .order_by(Event.deleted_at.is_not(None), Event.created_at.desc())
    )
    return await session.scalar(stmt)


async def _ensure_subscription_reminders(session: AsyncSession, event: Event) -> None:
    now = datetime.now(timezone.utc)
    offsets = [5 * 24 * 60, 3 * 24 * 60, 24 * 60, 60]
    existing = await session.scalars(select(Reminder).where(Reminder.event_id == event.id, Reminder.status != ReminderStatus.CANCELED))
    existing_offsets = {item.offset_minutes for item in existing.all()}
    for offset in offsets:
        scheduled_at = event.start_at - timedelta(minutes=offset)
        if offset not in existing_offsets and scheduled_at > now:
            session.add(Reminder(event_id=event.id, type=ReminderType.TELEGRAM, offset_minutes=offset, scheduled_at=scheduled_at, status=ReminderStatus.SCHEDULED))


@router.post("/upsert", status_code=status.HTTP_200_OK)
async def upsert_subscription_event(
    payload: SubscriptionEventUpsert,
    request: Request,
    x_internal_key: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
):
    _check_internal_key(x_internal_key)

    calendars = CalendarRepository(session)
    calendar = await calendars.get_by_title(payload.owner_subject_id, payload.calendar_title)
    if calendar is None:
        calendar = await calendars.create(
            payload.owner_subject_id,
            payload.calendar_title,
            color=payload.color,
            color_dark=payload.color_dark,
        )
    else:
        calendar.color = payload.color
        calendar.color_dark = payload.color_dark

    end_at = payload.ends_at or (payload.starts_at + timedelta(hours=1))
    event = await _find_event(session, payload.owner_subject_id, payload.external_ref)
    created = False
    if event is None:
        event = Event(
            calendar_id=calendar.id,
            title=payload.title.strip(),
            description=payload.description,
            location_text=payload.location_text,
            location_lat=payload.location_lat,
            location_lon=payload.location_lon,
            location_source=EventLocationSource.MAP_PICK if payload.location_lat is not None and payload.location_lon is not None else EventLocationSource.MANUAL_TEXT,
            start_at=payload.starts_at,
            end_at=end_at,
            all_day=payload.all_day,
            status=EventStatus.PLANNED,
            priority=payload.priority,
            route_origin_home=False,
            external_source="subs",
            external_ref=payload.external_ref,
        )
        session.add(event)
        created = True
    else:
        event.calendar_id = calendar.id
        event.title = payload.title.strip()
        event.description = payload.description
        event.location_text = payload.location_text
        event.location_lat = payload.location_lat
        event.location_lon = payload.location_lon
        event.location_source = EventLocationSource.MAP_PICK if payload.location_lat is not None and payload.location_lon is not None else EventLocationSource.MANUAL_TEXT
        event.start_at = payload.starts_at
        event.end_at = end_at
        event.all_day = payload.all_day
        event.status = EventStatus.PLANNED
        event.priority = payload.priority
        event.deleted_at = None

    await _ensure_subscription_reminders(session, event)
    await session.commit()
    await session.refresh(event)
    return success_response(data={"event_id": str(event.id), "created": created, "calendar_id": str(calendar.id)}, request=request)


@router.delete("/by-prefix/{external_ref_prefix:path}")
async def delete_subscription_events_by_prefix(
    external_ref_prefix: str,
    request: Request,
    x_internal_key: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
):
    _check_internal_key(x_internal_key)
    now = datetime.now(timezone.utc)
    stmt = select(Event).where(Event.external_source == "subs", Event.external_ref.startswith(external_ref_prefix), Event.deleted_at.is_(None), Event.start_at >= now)
    result = await session.scalars(stmt)
    events = result.all()
    for event in events:
        event.deleted_at = now
        event.status = EventStatus.CANCELED
        reminders = await ReminderService(session).reminders.all_by_event(event.id)
        for reminder in reminders:
            reminder.status = ReminderStatus.CANCELED
    await session.commit()
    return success_response(data={"deleted": len(events)}, request=request)


@router.delete("/{external_ref:path}")
async def delete_subscription_event(
    external_ref: str,
    request: Request,
    x_internal_key: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    _check_internal_key(x_internal_key)
    stmt = select(Event).where(Event.external_source == "subs", Event.external_ref == external_ref, Event.deleted_at.is_(None))
    result = await session.scalars(stmt)
    events = result.all()
    for event in events:
        event.deleted_at = datetime.now(timezone.utc)
        event.status = EventStatus.CANCELED
        reminders = await ReminderService(session).reminders.all_by_event(event.id)
        for reminder in reminders:
            reminder.status = ReminderStatus.CANCELED
    await session.commit()
    return success_response(data={"deleted": len(events)}, request=request)
