from __future__ import annotations

import uuid
from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar


class CalendarRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_user(self, user_id: UUID) -> Sequence[Calendar]:
        stmt = select(Calendar).where(Calendar.user_id == user_id).order_by(Calendar.created_at.asc())
        result = await self.session.scalars(stmt)
        return result.all()

    async def get_user_calendar(self, user_id: UUID, calendar_id: UUID) -> Calendar | None:
        stmt = select(Calendar).where(Calendar.id == calendar_id, Calendar.user_id == user_id)
        return await self.session.scalar(stmt)

    async def get_default(self, user_id: UUID) -> Calendar | None:
        stmt = select(Calendar).where(Calendar.user_id == user_id, Calendar.is_default.is_(True))
        return await self.session.scalar(stmt)

    async def create(self, user_id: UUID, title: str, color: str = "#2563eb", is_default: bool = False) -> Calendar:
        calendar = Calendar(id=uuid.uuid4(), user_id=user_id, title=title, color=color, is_default=is_default)
        self.session.add(calendar)
        await self.session.flush()
        return calendar

    async def delete(self, calendar: Calendar) -> None:
        await self.session.delete(calendar)
