from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventLocationSource, MapProvider, RouteMode, UserRole
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

    async def list_users(self, q: str | None = None, limit: int = 50, offset: int = 0) -> list[User]:
        stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
        if q:
            pattern = f"%{q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(User.email).like(pattern), func.lower(User.username).like(pattern)))
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def count_users(self, q: str | None = None) -> int:
        stmt = select(func.count()).select_from(User)
        if q:
            pattern = f"%{q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(User.email).like(pattern), func.lower(User.username).like(pattern)))
        value = await self.session.scalar(stmt)
        return int(value or 0)

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
        if "map_provider" in fields and fields["map_provider"] is not None:
            provider = fields["map_provider"]
            if isinstance(provider, MapProvider):
                user.map_provider = provider
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

    async def admin_update_user(
        self,
        user: User,
        *,
        username: str | None = None,
        display_name: str | None = None,
        display_name_set: bool = False,
        role: UserRole | None = None,
        is_active: bool | None = None,
    ) -> User:
        if username is not None:
            user.username = username.strip().lower()
        if display_name_set:
            user.display_name = (str(display_name).strip() or None) if isinstance(display_name, str) else None
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        await self.session.flush()
        return user

    async def update_twofa(
        self,
        user: User,
        *,
        method: str | None = None,
        totp_secret: str | None = None,
        totp_enabled_at=None,
        telegram_enabled_at=None,
        last_totp_step: int | None = None,
        clear_totp_secret: bool = False,
        clear_last_totp_step: bool = False,
    ) -> User:
        if method is not None:
            user.twofa_method = method
        if clear_totp_secret:
            user.twofa_totp_secret = None
        elif totp_secret is not None:
            user.twofa_totp_secret = totp_secret
        if totp_enabled_at is not None:
            user.twofa_totp_enabled_at = totp_enabled_at
        if telegram_enabled_at is not None:
            user.twofa_telegram_enabled_at = telegram_enabled_at
        if clear_last_totp_step:
            user.twofa_last_totp_step = None
        elif last_totp_step is not None:
            user.twofa_last_totp_step = last_totp_step
        await self.session.flush()
        return user
