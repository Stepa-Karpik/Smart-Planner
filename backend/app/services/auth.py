from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
    hash_password,
    hash_token,
    verify_password,
)
from app.repositories.calendar import CalendarRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()
        self.users = UserRepository(session)
        self.refresh_tokens = RefreshTokenRepository(session)
        self.calendars = CalendarRepository(session)

    async def register(self, email: str, username: str, password: str):
        existing_email = await self.users.get_by_email(email)
        if existing_email:
            raise ConflictError("Email already registered", details={"field": "email"})

        existing_username = await self.users.get_by_username(username)
        if existing_username:
            raise ConflictError("Username already registered", details={"field": "username"})

        password_hash = hash_password(password)
        user = await self.users.create(email=email, username=username, password_hash=password_hash)
        await self.calendars.create(user_id=user.id, title="Default", is_default=True)

        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id)
        await self._store_refresh_token(user.id, refresh_token)

        await self.session.commit()
        return user, access_token, refresh_token

    async def login(self, login: str, password: str):
        user = await self.users.get_by_login(login)
        if user is None or not user.is_active:
            raise UnauthorizedError("Invalid credentials")

        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid credentials")

        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id)
        await self._store_refresh_token(user.id, refresh_token)

        await self.session.commit()
        return user, access_token, refresh_token

    async def refresh(self, refresh_token: str):
        payload = decode_token(refresh_token)
        ensure_token_type(payload, "refresh")

        token_hash = hash_token(refresh_token)
        now = datetime.now(timezone.utc)
        token = await self.refresh_tokens.get_active(token_hash, now)
        if token is None:
            raise UnauthorizedError("Refresh token expired or revoked")

        await self.refresh_tokens.revoke(token, now)
        user = await self.users.get_by_id(token.user_id)
        if user is None:
            raise UnauthorizedError("User not found")

        new_access = create_access_token(user.id)
        new_refresh = create_refresh_token(user.id)
        await self._store_refresh_token(user.id, new_refresh)

        await self.session.commit()
        return user, new_access, new_refresh

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        now = datetime.now(timezone.utc)
        await self.refresh_tokens.revoke_by_hash(token_hash, now)
        await self.session.commit()

    async def _store_refresh_token(self, user_id, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=self.settings.jwt_refresh_ttl_days)
        await self.refresh_tokens.create(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
