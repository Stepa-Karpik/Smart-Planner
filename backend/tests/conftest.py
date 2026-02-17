from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api import deps
from app.db.base import Base
from app.main import app
from app.models import *  # noqa: F401,F403


TEST_DB_URL = os.getenv("TEST_DATABASE_URL")
TEST_REDIS_URL = os.getenv("TEST_REDIS_URL")


@pytest.fixture(scope="session")
def integration_enabled() -> bool:
    return bool(TEST_DB_URL and TEST_REDIS_URL)


@pytest.fixture(scope="session")
async def engine(integration_enabled: bool):
    if not integration_enabled:
        yield None
        return

    engine = create_async_engine(TEST_DB_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def redis_client(integration_enabled: bool):
    if not integration_enabled:
        yield None
        return

    redis = Redis.from_url(TEST_REDIS_URL, encoding="utf-8", decode_responses=True)
    await redis.flushdb()
    yield redis
    await redis.flushdb()
    await redis.close()


@pytest.fixture()
async def db_session(engine, integration_enabled: bool) -> AsyncGenerator[AsyncSession, None]:
    if not integration_enabled:
        pytest.skip("Integration env is not configured")

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
        await session.rollback()


@pytest.fixture()
async def app_client(engine, redis_client, integration_enabled: bool):
    if not integration_enabled:
        pytest.skip("Integration env is not configured")

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as session:
            yield session

    async def override_redis():
        return redis_client

    app.dependency_overrides[deps.get_db_session] = override_db
    app.dependency_overrides[deps.get_redis_client] = override_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture()
async def auth_headers(app_client):
    payload = {
        "email": "user@example.com",
        "username": "tester",
        "password": "StrongPass123",
    }
    response = await app_client.post("/api/v1/auth/register", json=payload)
    body = response.json()
    access = body["data"]["tokens"]["access_token"]
    refresh = body["data"]["tokens"]["refresh_token"]
    return {
        "Authorization": f"Bearer {access}",
        "X-Refresh-Token": refresh,
    }
