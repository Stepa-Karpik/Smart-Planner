from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseReadModel


class CalendarCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    color: str = Field(default="#2563eb", min_length=4, max_length=16)


class CalendarUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    color: str | None = Field(default=None, min_length=4, max_length=16)


class CalendarRead(BaseReadModel):
    id: UUID
    title: str
    color: str
    is_default: bool
    created_at: datetime
