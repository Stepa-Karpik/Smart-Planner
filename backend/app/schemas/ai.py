from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import AIRole, AITaskSource, AITaskStatus


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: UUID | None = None


class AIChatResponse(BaseModel):
    session_id: UUID
    answer: str


class AIIngestTaskRequest(BaseModel):
    source: AITaskSource
    payload_ref: str
    text: str


class AIIngestTaskResponse(BaseModel):
    job_id: UUID
    status: AITaskStatus


class AISessionRead(BaseModel):
    id: UUID
    created_at: datetime
    last_used_at: datetime

    model_config = {"from_attributes": True}


class AIMessageRead(BaseModel):
    id: UUID
    role: AIRole
    content: str
    provider: str
    model: str
    tokens_in: int
    tokens_out: int
    created_at: datetime

    model_config = {"from_attributes": True}
