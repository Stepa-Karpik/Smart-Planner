from __future__ import annotations

from datetime import datetime
from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.enums import ReminderStatus
from app.models import Calendar, Event, Reminder, User


class ReminderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_event(self, user_id: UUID, event_id: UUID) -> Sequence[Reminder]:
        stmt = (
            select(Reminder)
            .join(Event, Reminder.event_id == Event.id)
            .join(Calendar, Event.calendar_id == Calendar.id)
            .where(Calendar.user_id == user_id, Event.id == event_id)
            .order_by(Reminder.scheduled_at.asc())
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def get_user_reminder(self, user_id: UUID, reminder_id: UUID) -> Reminder | None:
        stmt = (
            select(Reminder)
            .join(Event, Reminder.event_id == Event.id)
            .join(Calendar, Event.calendar_id == Calendar.id)
            .where(Calendar.user_id == user_id, Reminder.id == reminder_id)
        )
        return await self.session.scalar(stmt)

    async def create(self, reminder: Reminder) -> Reminder:
        self.session.add(reminder)
        await self.session.flush()
        return reminder

    async def due_for_delivery(self, now_dt: datetime, batch_size: int = 100) -> Sequence[Reminder]:
        stmt = (
            select(Reminder)
            .options(
                joinedload(Reminder.event)
                .joinedload(Event.calendar)
                .joinedload(Calendar.user)
                .joinedload(User.telegram_link)
            )
            .where(
                Reminder.status == ReminderStatus.SCHEDULED,
                Reminder.scheduled_at <= now_dt,
            )
            .order_by(Reminder.scheduled_at.asc())
            .limit(batch_size)
        )
        result = await self.session.scalars(stmt)
        return result.unique().all()

    async def active_by_event(self, event_id: UUID) -> Sequence[Reminder]:
        stmt = select(Reminder).where(
            Reminder.event_id == event_id,
            Reminder.status.in_([ReminderStatus.SCHEDULED, ReminderStatus.FAILED]),
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def all_by_event(self, event_id: UUID) -> Sequence[Reminder]:
        stmt = select(Reminder).where(Reminder.event_id == event_id)
        result = await self.session.scalars(stmt)
        return result.all()
