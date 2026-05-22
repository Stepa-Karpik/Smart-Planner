from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.enums import UserRole


class AdminUserRead(BaseModel):
    user_id: str
    email: EmailStr
    username: str
    display_name: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AdminUserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=64)
    display_name: str | None = Field(default=None, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("username must not be empty")
        return normalized

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None



class AdminSubscriptionRead(BaseModel):
    id: str
    user_id: str
    username: str
    display_name: str | None = None
    email: EmailStr
    plan: str
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminSubscriptionUpdate(BaseModel):
    plan: str = Field(pattern="^(free|plus|pro)$")
    expires_at: datetime | None = None


class AdminOverviewRead(BaseModel):
    service: str
    users_total: int
    open_tickets: int
    answered_tickets: int
    closed_tickets: int
    feed_items: int
    active_subscriptions: int
    subscription_distribution: dict[str, int]
    new_users: list[dict]
    api_requests: list[dict]
