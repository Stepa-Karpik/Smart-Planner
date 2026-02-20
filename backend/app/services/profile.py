from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.repositories.user import UserRepository


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)

    async def get_profile(self, user_id: UUID):
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        return user

    async def update_profile(self, user_id: UUID, payload):
        user = await self.get_profile(user_id)

        if payload.username and payload.username != user.username:
            existing = await self.users.get_by_username(payload.username)
            if existing and existing.id != user.id:
                raise ConflictError("Username already registered", details={"field": "username"})

        updates: dict = {}
        fields_set = payload.model_fields_set
        for field in (
            "display_name",
            "username",
            "default_route_mode",
            "map_provider",
            "home_location_text",
            "home_location_lat",
            "home_location_lon",
            "home_location_source",
        ):
            if field in fields_set:
                updates[field] = getattr(payload, field)

        await self.users.update_profile(user, **updates)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def change_password(self, user_id: UUID, current_password: str, new_password: str):
        user = await self.get_profile(user_id)
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedError("Current password is invalid")
        await self.users.set_password_hash(user, hash_password(new_password))
        await self.session.commit()
