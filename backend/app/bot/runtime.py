from __future__ import annotations

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.integrations.redis import get_redis


async def new_session() -> AsyncSession:
    return SessionLocal()


async def redis_client() -> Redis:
    return await get_redis()
