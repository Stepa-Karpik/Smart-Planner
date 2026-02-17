from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventLocationSource, RouteMode
from app.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        stmt = select(User).where(User.id == user_id)
        return await self.session.scalar(stmt)

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email.lower())
        return await self.session.scalar(stmt)

    async def get_by_username(self, username: str) -> User | None:
        stmt = select(User).where(User.username == username.lower())
        return await self.session.scalar(stmt)

    async def get_by_login(self, login: str) -> User | None:
        normalized = login.lower()
        stmt = select(User).where(or_(User.email == normalized, User.username == normalized))
        return await self.session.scalar(stmt)

    async def create(self, email: str, username: str, password_hash: str) -> User:
        normalized_username = username.lower()
        user = User(
            email=email.lower(),
            username=normalized_username,
            display_name=username.strip() or normalized_username,
            password_hash=password_hash,
            is_active=True,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def update_profile(self, user: User, **fields) -> User:
        if "display_name" in fields:
            value = fields["display_name"]
            user.display_name = (value.strip() or None) if isinstance(value, str) else None
        if "username" in fields and fields["username"] is not None:
            user.username = str(fields["username"]).strip().lower()
        if "default_route_mode" in fields and fields["default_route_mode"] is not None:
            user.default_route_mode = fields["default_route_mode"]
        if "home_location_text" in fields:
            value = fields["home_location_text"]
            user.home_location_text = (value.strip() or None) if isinstance(value, str) else None
        if "home_location_lat" in fields:
            user.home_location_lat = fields["home_location_lat"]
        if "home_location_lon" in fields:
            user.home_location_lon = fields["home_location_lon"]
        if "home_location_source" in fields:
            source = fields["home_location_source"]
            user.home_location_source = source if isinstance(source, EventLocationSource) or source is None else None
        await self.session.flush()
        return user

    async def set_password_hash(self, user: User, password_hash: str) -> User:
        user.password_hash = password_hash
        await self.session.flush()
        return user
