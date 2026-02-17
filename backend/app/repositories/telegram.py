from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TelegramLink, TelegramStartCode


class TelegramRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_link_by_user(self, user_id: UUID) -> TelegramLink | None:
        stmt = select(TelegramLink).where(TelegramLink.user_id == user_id)
        return await self.session.scalar(stmt)

    async def get_link_by_chat(self, chat_id: int) -> TelegramLink | None:
        stmt = select(TelegramLink).where(TelegramLink.telegram_chat_id == chat_id)
        return await self.session.scalar(stmt)

    async def upsert_link(self, user_id: UUID, chat_id: int, username: str | None) -> TelegramLink:
        link = await self.get_link_by_user(user_id)
        if link is None:
            link = TelegramLink(
                user_id=user_id,
                telegram_chat_id=chat_id,
                telegram_username=username,
                is_confirmed=True,
            )
            self.session.add(link)
        else:
            link.telegram_chat_id = chat_id
            link.telegram_username = username
            link.is_confirmed = True
        await self.session.flush()
        return link

    async def unlink(self, user_id: UUID) -> None:
        link = await self.get_link_by_user(user_id)
        if link is not None:
            await self.session.delete(link)

    async def create_start_code(self, code_hash: str, user_id: UUID, expires_at: datetime) -> TelegramStartCode:
        record = TelegramStartCode(code_hash=code_hash, user_id=user_id, expires_at=expires_at)
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_active_start_code(self, code_hash: str, now: datetime) -> TelegramStartCode | None:
        stmt = select(TelegramStartCode).where(
            TelegramStartCode.code_hash == code_hash,
            TelegramStartCode.expires_at > now,
            TelegramStartCode.used_at.is_(None),
        )
        return await self.session.scalar(stmt)

    async def mark_start_code_used(self, record: TelegramStartCode, used_at: datetime) -> None:
        record.used_at = used_at
        await self.session.flush()
