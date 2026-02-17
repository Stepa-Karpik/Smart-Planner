from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import ReminderStatus, ReminderType
from app.schemas.common import BaseReadModel


class ReminderCreate(BaseModel):
    offset_minutes: int = Field(ge=1, le=10080)


class ReminderRead(BaseReadModel):
    id: UUID
    event_id: UUID
    type: ReminderType
    offset_minutes: int
    scheduled_at: datetime
    status: ReminderStatus
    last_error: str | None
    created_at: datetime
    updated_at: datetime
