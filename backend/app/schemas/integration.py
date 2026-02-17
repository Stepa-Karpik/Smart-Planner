from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TelegramStartResponse(BaseModel):
    deep_link: str
    desktop_link: str
    expires_at: datetime
    instruction: str


class TelegramStatusResponse(BaseModel):
    is_linked: bool
    is_confirmed: bool
    telegram_username: str | None
    telegram_chat_id: int | None
