from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.repositories.calendar import CalendarRepository


class CalendarService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.calendars = CalendarRepository(session)

    async def list_calendars(self, user_id: UUID):
        return await self.calendars.list_by_user(user_id)

    async def create_calendar(self, user_id: UUID, title: str, color: str):
        calendar = await self.calendars.create(user_id=user_id, title=title, color=color)
        await self.session.commit()
        return calendar

    async def update_calendar(self, user_id: UUID, calendar_id: UUID, title: str | None, color: str | None):
        calendar = await self.calendars.get_user_calendar(user_id, calendar_id)
        if calendar is None:
            raise NotFoundError("Calendar not found")
        if title is not None:
            calendar.title = title
        if color is not None:
            calendar.color = color
        await self.session.commit()
        await self.session.refresh(calendar)
        return calendar

    async def delete_calendar(self, user_id: UUID, calendar_id: UUID) -> None:
        calendar = await self.calendars.get_user_calendar(user_id, calendar_id)
        if calendar is None:
            raise NotFoundError("Calendar not found")
        if calendar.is_default:
            raise ForbiddenError("Default calendar cannot be deleted")
        await self.calendars.delete(calendar)
        await self.session.commit()
