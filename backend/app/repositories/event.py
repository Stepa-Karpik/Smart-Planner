from __future__ import annotations

from datetime import datetime
from typing import Sequence
from uuid import UUID

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventStatus
from app.models import Calendar, Event


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _base_user_query(self, user_id: UUID) -> Select:
        return select(Event).join(Calendar, Event.calendar_id == Calendar.id).where(Calendar.user_id == user_id)

    async def list_by_user(
        self,
        user_id: UUID,
        from_dt: datetime | None = None,
        to_dt: datetime | None = None,
        calendar_id: UUID | None = None,
        status: EventStatus | None = None,
        q: str | None = None,
        include_deleted: bool = False,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Sequence[Event]:
        stmt = self._base_user_query(user_id)
        if not include_deleted:
            stmt = stmt.where(Event.deleted_at.is_(None))
        if from_dt is not None:
            stmt = stmt.where(Event.end_at >= from_dt)
        if to_dt is not None:
            stmt = stmt.where(Event.start_at <= to_dt)
        if calendar_id is not None:
            stmt = stmt.where(Event.calendar_id == calendar_id)
        if status is not None:
            stmt = stmt.where(Event.status == status)
        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Event.title.ilike(pattern), Event.description.ilike(pattern), Event.location_text.ilike(pattern)))

        stmt = stmt.order_by(Event.start_at.asc())
        if offset:
            stmt = stmt.offset(offset)
        if limit:
            stmt = stmt.limit(limit)

        result = await self.session.scalars(stmt)
        return result.all()

    async def count_by_user(
        self,
        user_id: UUID,
        from_dt: datetime | None = None,
        to_dt: datetime | None = None,
        calendar_id: UUID | None = None,
        status: EventStatus | None = None,
        q: str | None = None,
    ) -> int:
        stmt = select(func.count(Event.id)).join(Calendar, Event.calendar_id == Calendar.id).where(
            Calendar.user_id == user_id,
            Event.deleted_at.is_(None),
        )
        if from_dt is not None:
            stmt = stmt.where(Event.end_at >= from_dt)
        if to_dt is not None:
            stmt = stmt.where(Event.start_at <= to_dt)
        if calendar_id is not None:
            stmt = stmt.where(Event.calendar_id == calendar_id)
        if status is not None:
            stmt = stmt.where(Event.status == status)
        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Event.title.ilike(pattern), Event.description.ilike(pattern), Event.location_text.ilike(pattern)))
        value = await self.session.scalar(stmt)
        return int(value or 0)

    async def get_user_event(self, user_id: UUID, event_id: UUID, include_deleted: bool = False) -> Event | None:
        stmt = self._base_user_query(user_id).where(Event.id == event_id)
        if not include_deleted:
            stmt = stmt.where(Event.deleted_at.is_(None))
        return await self.session.scalar(stmt)

    async def create(self, event: Event) -> Event:
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_user_events_in_range(self, user_id: UUID, from_dt: datetime, to_dt: datetime) -> Sequence[Event]:
        stmt = (
            self._base_user_query(user_id)
            .where(
                Event.deleted_at.is_(None),
                Event.start_at <= to_dt,
                Event.end_at >= from_dt,
                Event.status != EventStatus.CANCELED,
            )
            .order_by(Event.start_at.asc())
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def list_users_with_events_in_window(self, from_dt: datetime, to_dt: datetime) -> Sequence[UUID]:
        stmt = (
            select(Calendar.user_id)
            .join(Event, Event.calendar_id == Calendar.id)
            .where(
                Event.deleted_at.is_(None),
                Event.status == EventStatus.PLANNED,
                Event.start_at <= to_dt,
                Event.end_at >= from_dt,
            )
            .group_by(Calendar.user_id)
        )
        result = await self.session.scalars(stmt)
        return result.all()
