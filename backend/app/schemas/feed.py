from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.enums import FeedItemType


class FeedItemRead(BaseModel):
    id: str
    type: FeedItemType
    title: str
    body: str
    meta: dict[str, Any] | None = None
    target_username: str | None = None
    published_at: datetime
    created_at: datetime
    updated_at: datetime
    created_by_user_id: str | None = None


class FeedListQuery(BaseModel):
    types: list[FeedItemType] = Field(default_factory=list)
    limit: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class AdminFeedItemCreate(BaseModel):
    type: FeedItemType
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=4000)
    meta: dict[str, Any] | None = None
    target_username: str | None = Field(default=None, max_length=64)
    published_at: datetime | None = None

    @field_validator("title", "body")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("target_username")
    @classmethod
    def normalize_target_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None


class AdminFeedItemUpdate(BaseModel):
    type: FeedItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    meta: dict[str, Any] | None = None
    target_username: str | None = Field(default=None, max_length=64)
    published_at: datetime | None = None

    @field_validator("title", "body")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be empty")
        return normalized

    @field_validator("target_username")
    @classmethod
    def normalize_target_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None
