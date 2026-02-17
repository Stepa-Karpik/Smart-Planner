from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.core.enums import EventLocationSource, EventStatus
from app.schemas.common import BaseReadModel


class EventCreate(BaseModel):
    calendar_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    location_text: str | None = Field(default=None, max_length=255)
    location_lat: float | None = Field(default=None, ge=-90, le=90)
    location_lon: float | None = Field(default=None, ge=-180, le=180)
    location_source: EventLocationSource = EventLocationSource.MANUAL_TEXT
    start_at: datetime
    end_at: datetime | None = None
    all_day: bool = False
    status: EventStatus = EventStatus.PLANNED
    priority: int = Field(default=0, ge=0, le=3)

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_at is not None and self.end_at <= self.start_at:
            raise ValueError("end_at must be greater than start_at")
        if not self.title.strip():
            raise ValueError("title must not be empty")
        return self


class EventUpdate(BaseModel):
    calendar_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    location_text: str | None = Field(default=None, max_length=255)
    location_lat: float | None = Field(default=None, ge=-90, le=90)
    location_lon: float | None = Field(default=None, ge=-180, le=180)
    location_source: EventLocationSource | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    status: EventStatus | None = None
    priority: int | None = Field(default=None, ge=0, le=3)

    @model_validator(mode="after")
    def validate_partial_times(self):
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValueError("end_at must be greater than start_at")
        return self


class EventRead(BaseReadModel):
    id: UUID
    calendar_id: UUID
    title: str
    description: str | None
    location_text: str | None
    location_lat: float | None
    location_lon: float | None
    location_source: EventLocationSource
    start_at: datetime
    end_at: datetime
    all_day: bool
    status: EventStatus
    priority: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
