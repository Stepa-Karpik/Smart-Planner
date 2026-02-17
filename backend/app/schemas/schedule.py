from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.core.enums import RouteMode


class ConflictSuggestion(BaseModel):
    prev_event_id: UUID | None = None
    prev_event_title: str | None = None
    next_event_id: UUID
    next_event_title: str
    current_start_at: datetime
    suggested_start_at: datetime
    suggested_end_at: datetime
    mode: RouteMode
    travel_time_sec: int
    reason: str
    faster_mode: RouteMode | None = None


class FeasibilityResponse(BaseModel):
    conflicts: list[ConflictSuggestion]
