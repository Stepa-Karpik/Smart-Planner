from __future__ import annotations

from aiogram import Bot

from app.core.config import get_settings


_bot: Bot | None = None


def get_bot() -> Bot:
    global _bot
    if _bot is None:
        settings = get_settings()
        _bot = Bot(token=settings.telegram_bot_token)
    return _bot


async def close_bot() -> None:
    global _bot
    if _bot is not None:
        await _bot.session.close()
        _bot = None
