from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> RefreshToken:
        token = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_active(self, token_hash: str, now: datetime) -> RefreshToken | None:
        stmt = select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.expires_at > now,
            RefreshToken.revoked_at.is_(None),
        )
        return await self.session.scalar(stmt)

    async def revoke(self, token: RefreshToken, revoked_at: datetime) -> None:
        token.revoked_at = revoked_at
        await self.session.flush()

    async def revoke_by_hash(self, token_hash: str, revoked_at: datetime) -> None:
        token = await self.get_active(token_hash, revoked_at)
        if token:
            token.revoked_at = revoked_at
            await self.session.flush()
