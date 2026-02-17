from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventStatus, ReminderStatus
from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import Event
from app.repositories.calendar import CalendarRepository
from app.repositories.event import EventRepository
from app.services.geocoding import GeocodingService
from app.services.reminders import ReminderService


class EventService:
    def __init__(self, session: AsyncSession, redis: Redis, geocoding_service: GeocodingService | None = None) -> None:
        self.session = session
        self.events = EventRepository(session)
        self.calendars = CalendarRepository(session)
        self.reminder_service = ReminderService(session)
        self.geocoding_service = geocoding_service or GeocodingService(redis)

    async def list_events(
        self,
        user_id: UUID,
        from_dt: datetime | None,
        to_dt: datetime | None,
        calendar_id: UUID | None,
        status: EventStatus | None,
        q: str | None,
        limit: int | None,
        offset: int | None,
    ):
        items = await self.events.list_by_user(
            user_id=user_id,
            from_dt=from_dt,
            to_dt=to_dt,
            calendar_id=calendar_id,
            status=status,
            q=q,
            limit=limit,
            offset=offset,
        )
        total = await self.events.count_by_user(
            user_id=user_id,
            from_dt=from_dt,
            to_dt=to_dt,
            calendar_id=calendar_id,
            status=status,
            q=q,
        )
        return items, total

    async def create_event(self, user_id: UUID, payload) -> Event:
        end_at = payload.end_at or (payload.start_at + timedelta(hours=1))
        if end_at <= payload.start_at:
            raise ValidationAppError("end_at must be greater than start_at")

        calendar_id = payload.calendar_id
        if calendar_id is None:
            default_calendar = await self.calendars.get_default(user_id)
            if default_calendar is None:
                default_calendar = await self.calendars.create(user_id, "Default", is_default=True)
            calendar_id = default_calendar.id

        calendar = await self.calendars.get_user_calendar(user_id=user_id, calendar_id=calendar_id)
        if calendar is None:
            raise NotFoundError("Calendar not found")

        location_lat = payload.location_lat
        location_lon = payload.location_lon
        location_source = payload.location_source

        if payload.location_text and (location_lat is None or location_lon is None):
            geocoded_point, source = await self.geocoding_service.geocode_with_cache(payload.location_text)
            if geocoded_point is not None:
                location_lat = geocoded_point.lat
                location_lon = geocoded_point.lon
                location_source = source

        event = Event(
            calendar_id=calendar.id,
            title=payload.title.strip(),
            description=payload.description,
            location_text=payload.location_text,
            location_lat=location_lat,
            location_lon=location_lon,
            location_source=location_source,
            start_at=payload.start_at,
            end_at=end_at,
            all_day=payload.all_day,
            status=payload.status,
            priority=payload.priority,
        )
        await self.events.create(event)
        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def get_event(self, user_id: UUID, event_id: UUID) -> Event:
        event = await self.events.get_user_event(user_id=user_id, event_id=event_id)
        if event is None:
            raise NotFoundError("Event not found")
        return event

    async def update_event(self, user_id: UUID, event_id: UUID, payload) -> Event:
        event = await self.events.get_user_event(user_id=user_id, event_id=event_id)
        if event is None:
            raise NotFoundError("Event not found")

        old_start_at = event.start_at

        if payload.calendar_id is not None:
            calendar = await self.calendars.get_user_calendar(user_id=user_id, calendar_id=payload.calendar_id)
            if calendar is None:
                raise NotFoundError("Calendar not found")
            event.calendar_id = calendar.id

        for field in [
            "title",
            "description",
            "location_text",
            "location_lat",
            "location_lon",
            "location_source",
            "start_at",
            "end_at",
            "all_day",
            "status",
            "priority",
        ]:
            value = getattr(payload, field, None)
            if value is not None:
                setattr(event, field, value)

        if event.end_at <= event.start_at:
            raise ValidationAppError("end_at must be greater than start_at")

        if event.location_text and (event.location_lat is None or event.location_lon is None):
            geocoded_point, source = await self.geocoding_service.geocode_with_cache(event.location_text)
            if geocoded_point is not None:
                event.location_lat = geocoded_point.lat
                event.location_lon = geocoded_point.lon
                event.location_source = source

        if event.start_at != old_start_at:
            await self.reminder_service.recalculate_for_event(event.id, event.start_at)

        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def soft_delete_event(self, user_id: UUID, event_id: UUID) -> None:
        event = await self.events.get_user_event(user_id=user_id, event_id=event_id)
        if event is None:
            raise NotFoundError("Event not found")

        event.deleted_at = datetime.now(timezone.utc)
        event.status = EventStatus.CANCELED
        reminders = await self.reminder_service.reminders.all_by_event(event.id)
        for reminder in reminders:
            reminder.status = ReminderStatus.CANCELED

        await self.session.commit()

    async def set_status(self, user_id: UUID, event_id: UUID, status: EventStatus) -> Event:
        event = await self.get_event(user_id, event_id)
        event.status = status
        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def get_today_events(self, user_id: UUID) -> list[Event]:
        now = datetime.now(timezone.utc)
        start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)
        return list(
            await self.events.list_by_user(
                user_id=user_id,
                from_dt=start,
                to_dt=end,
                status=None,
                calendar_id=None,
                q=None,
                limit=200,
                offset=0,
            )
        )

    async def get_upcoming_events(self, user_id: UUID, hours: int = 24) -> list[Event]:
        now = datetime.now(timezone.utc)
        to_dt = now + timedelta(hours=hours)
        return list(
            await self.events.list_by_user(
                user_id=user_id,
                from_dt=now,
                to_dt=to_dt,
                status=EventStatus.PLANNED,
                calendar_id=None,
                q=None,
                limit=200,
                offset=0,
            )
        )

    async def list_events_range(self, user_id: UUID, from_dt: datetime, to_dt: datetime) -> list[Event]:
        return list(await self.events.list_user_events_in_range(user_id=user_id, from_dt=from_dt, to_dt=to_dt))

    async def find_free_slots(
        self,
        user_id: UUID,
        duration_minutes: int,
        from_dt: datetime,
        to_dt: datetime,
        work_start_hour: int = 9,
        work_end_hour: int = 19,
    ) -> list[dict]:
        events = await self.events.list_user_events_in_range(user_id=user_id, from_dt=from_dt, to_dt=to_dt)
        ordered = sorted(events, key=lambda item: item.start_at)
        pointer = from_dt
        result: list[dict] = []

        for event in ordered:
            if pointer < event.start_at:
                if (event.start_at - pointer).total_seconds() >= duration_minutes * 60:
                    result.append({"start_at": pointer.isoformat(), "end_at": event.start_at.isoformat()})
            pointer = max(pointer, event.end_at)

        if to_dt > pointer and (to_dt - pointer).total_seconds() >= duration_minutes * 60:
            result.append({"start_at": pointer.isoformat(), "end_at": to_dt.isoformat()})

        filtered: list[dict] = []
        for slot in result:
            slot_start = datetime.fromisoformat(slot["start_at"])
            slot_end = datetime.fromisoformat(slot["end_at"])
            if work_start_hour <= slot_start.hour <= work_end_hour and work_start_hour <= slot_end.hour <= 23:
                filtered.append(slot)
        return filtered
