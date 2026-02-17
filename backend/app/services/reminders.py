from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReminderStatus, ReminderType
from app.core.exceptions import NotFoundError
from app.models import Reminder
from app.repositories.event import EventRepository
from app.repositories.reminder import ReminderRepository


def calculate_scheduled_at(start_at, offset_minutes: int):
    return start_at - timedelta(minutes=offset_minutes)


class ReminderService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.events = EventRepository(session)
        self.reminders = ReminderRepository(session)

    async def list_event_reminders(self, user_id: UUID, event_id: UUID):
        return await self.reminders.list_by_event(user_id=user_id, event_id=event_id)

    async def add_reminder(self, user_id: UUID, event_id: UUID, offset_minutes: int) -> Reminder:
        event = await self.events.get_user_event(user_id=user_id, event_id=event_id)
        if event is None:
            raise NotFoundError("Event not found")

        reminder = Reminder(
            event_id=event.id,
            type=ReminderType.TELEGRAM,
            offset_minutes=offset_minutes,
            scheduled_at=calculate_scheduled_at(event.start_at, offset_minutes),
            status=ReminderStatus.SCHEDULED,
        )
        await self.reminders.create(reminder)
        await self.session.commit()
        await self.session.refresh(reminder)
        return reminder

    async def cancel_reminder(self, user_id: UUID, reminder_id: UUID) -> None:
        reminder = await self.reminders.get_user_reminder(user_id=user_id, reminder_id=reminder_id)
        if reminder is None:
            raise NotFoundError("Reminder not found")

        reminder.status = ReminderStatus.CANCELED
        await self.session.commit()

    async def recalculate_for_event(self, event_id: UUID, new_start_at) -> None:
        reminders = await self.reminders.active_by_event(event_id)
        for reminder in reminders:
            reminder.scheduled_at = calculate_scheduled_at(new_start_at, reminder.offset_minutes)
            reminder.status = ReminderStatus.SCHEDULED
            reminder.last_error = None
        await self.session.flush()
