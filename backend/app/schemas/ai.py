from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import AIChatType, AIRole, AITaskSource, AITaskStatus, AssistantMode


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: UUID | None = None
    chat_type: AIChatType | None = None
    selected_option_id: str | None = None


class AIChatResponse(BaseModel):
    session_id: UUID
    chat_type: AIChatType | None = None
    display_index: int | None = None
    answer: str
    mode: AssistantMode | None = None
    intent: str | None = None
    fallback_reason_code: str | None = None
    requires_user_input: bool = False
    clarifying_question: str | None = None
    options: list[dict] = Field(default_factory=list)
    memory_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    planner_summary: dict[str, Any] = Field(default_factory=dict)
    response_meta: str | None = None


class AssistantModeRead(BaseModel):
    default_mode: AssistantMode
    active_session_id: UUID | None = None
    active_chat_type: AIChatType | None = None


class AssistantModeUpdate(BaseModel):
    default_mode: AssistantMode
    session_id: UUID | None = None
    create_new_chat: bool = False


class AIIngestTaskRequest(BaseModel):
    source: AITaskSource
    payload_ref: str
    text: str


class AIIngestTaskResponse(BaseModel):
    job_id: UUID
    status: AITaskStatus


class AISessionRead(BaseModel):
    id: UUID
    chat_type: AIChatType
    display_index: int
    created_at: datetime
    last_used_at: datetime

    model_config = {"from_attributes": True}


class AISessionCreateRequest(BaseModel):
    chat_type: AIChatType | None = None


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
