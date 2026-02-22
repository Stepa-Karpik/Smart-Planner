from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationAppError
from app.core.security import hash_telegram_code
from app.repositories.telegram import TelegramRepository
from app.repositories.user import UserRepository


class TelegramIntegrationService:
    def __init__(self, session: AsyncSession, redis: Redis) -> None:
        self.session = session
        self.redis = redis
        self.settings = get_settings()
        self.telegram_repo = TelegramRepository(session)

    async def generate_start_link(self, user_id: UUID) -> tuple[str, str, datetime]:
        raw_code = secrets.token_urlsafe(24)
        code_hash = hash_telegram_code(raw_code)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=self.settings.telegram_start_ttl_min)

        redis_key = f"tg:start:{code_hash}"
        await self.redis.setex(redis_key, self.settings.telegram_start_ttl_min * 60, str(user_id))
        await self.telegram_repo.create_start_code(code_hash=code_hash, user_id=user_id, expires_at=expires_at)
        await self.session.commit()

        bot_username = self.settings.telegram_bot_username.strip().lstrip("@")
        if not bot_username:
            raise ValidationAppError("TELEGRAM_BOT_USERNAME is not configured")
        deep_link = f"https://t.me/{bot_username}?start={raw_code}"
        desktop_link = f"tg://resolve?domain={bot_username}&start={raw_code}"
        return deep_link, desktop_link, expires_at

    async def consume_start_code(self, raw_code: str, chat_id: int, telegram_username: str | None) -> UUID:
        code_hash = hash_telegram_code(raw_code)
        redis_key = f"tg:start:{code_hash}"
        user_id_value = await self.redis.get(redis_key)
        if user_id_value is None:
            raise UnauthorizedError("Start code expired or invalid")

        now = datetime.now(timezone.utc)
        pending = await self.telegram_repo.get_active_start_code(code_hash=code_hash, now=now)
        if pending is None:
            raise UnauthorizedError("Start code expired or invalid")

        user_id = pending.user_id
        if str(user_id) != user_id_value:
            raise UnauthorizedError("Start code mismatch")
        await self.telegram_repo.upsert_link(user_id=user_id, chat_id=chat_id, username=telegram_username)
        await self.telegram_repo.mark_start_code_used(pending, used_at=now)
        await self.redis.delete(redis_key)

        await self.session.commit()
        return user_id

    async def status(self, user_id: UUID) -> dict:
        link = await self.telegram_repo.get_link_by_user(user_id)
        if link is None:
            return {
                "is_linked": False,
                "is_confirmed": False,
                "telegram_username": None,
                "telegram_chat_id": None,
            }
        return {
            "is_linked": True,
            "is_confirmed": link.is_confirmed,
            "telegram_username": link.telegram_username,
            "telegram_chat_id": link.telegram_chat_id,
        }

    async def unlink(self, user_id: UUID) -> None:
        await self.telegram_repo.unlink(user_id)
        user = await UserRepository(self.session).get_by_id(user_id)
        if user is not None and (getattr(user, "twofa_method", "none") or "none").lower() == "telegram":
            user.twofa_method = "none"
        await self.session.commit()

    async def get_user_id_by_chat(self, chat_id: int) -> UUID:
        link = await self.telegram_repo.get_link_by_chat(chat_id)
        if link is None or not link.is_confirmed:
            raise NotFoundError("Telegram account is not linked")
        return link.user_id
