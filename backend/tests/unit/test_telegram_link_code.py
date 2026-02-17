from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import fakeredis.aioredis
import pytest

from app.services.telegram import TelegramIntegrationService


class FakeSession:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


class FakeTelegramRepo:
    def __init__(self):
        self.pending = {}
        self.links = {}

    async def create_start_code(self, code_hash, user_id, expires_at):
        self.pending[code_hash] = SimpleNamespace(user_id=user_id, code_hash=code_hash, expires_at=expires_at, used_at=None)

    async def get_active_start_code(self, code_hash, now):
        item = self.pending.get(code_hash)
        if not item:
            return None
        if item.used_at is not None or item.expires_at <= now:
            return None
        return item

    async def upsert_link(self, user_id, chat_id, username):
        self.links[user_id] = {"chat_id": chat_id, "username": username}

    async def mark_start_code_used(self, record, used_at):
        record.used_at = used_at

    async def get_link_by_user(self, user_id):
        value = self.links.get(user_id)
        if value is None:
            return None
        return SimpleNamespace(
            user_id=user_id,
            telegram_chat_id=value["chat_id"],
            telegram_username=value["username"],
            is_confirmed=True,
        )


@pytest.mark.asyncio
async def test_telegram_code_generation_and_consume():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    session = FakeSession()
    service = TelegramIntegrationService(session, redis)  # type: ignore[arg-type]
    fake_repo = FakeTelegramRepo()
    service.telegram_repo = fake_repo  # type: ignore[assignment]

    user_id = uuid4()
    deep_link, desktop_link, _ = await service.generate_start_link(user_id)
    assert "?start=" in deep_link
    assert desktop_link.startswith("tg://resolve?")

    code = deep_link.split("?start=", 1)[1]
    linked_user_id = await service.consume_start_code(code, chat_id=123456, telegram_username="tester")

    assert linked_user_id == user_id
    status = await service.status(user_id)
    assert status["is_linked"] is True
    assert status["telegram_chat_id"] == 123456
