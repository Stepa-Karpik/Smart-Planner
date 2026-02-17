from __future__ import annotations

from typing import AsyncGenerator
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token, ensure_token_type
from app.db.session import get_session
from app.integrations.redis import get_redis
from app.repositories.user import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


async def get_redis_client() -> Redis:
    return await get_redis()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db_session),
):
    if credentials is None:
        raise UnauthorizedError("Authorization header missing")
    payload = decode_token(credentials.credentials)
    ensure_token_type(payload, "access")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")

    try:
        user_uuid = UUID(user_id)
    except (ValueError, TypeError) as exc:
        raise UnauthorizedError("Invalid token payload") from exc

    user = await UserRepository(session).get_by_id(user_uuid)
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    return user
