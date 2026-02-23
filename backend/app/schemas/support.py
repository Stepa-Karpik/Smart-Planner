from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.enums import SupportTicketStatus


class SupportAttachmentRead(BaseModel):
    original_name: str
    stored_name: str
    content_type: str
    size_bytes: int


class SupportTicketMessageRead(BaseModel):
    id: str
    ticket_id: str
    author_user_id: str | None = None
    author_role: Literal["user", "admin", "system"]
    body: str
    attachments: list[SupportAttachmentRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SupportTicketRead(BaseModel):
    id: str
    public_number: int
    user_id: str
    topic: str
    subtopic: str
    subject: str
    status: SupportTicketStatus
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SupportTicketDetailRead(SupportTicketRead):
    messages: list[SupportTicketMessageRead] = Field(default_factory=list)


class AdminSupportTicketReplyCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be empty")
        return value

