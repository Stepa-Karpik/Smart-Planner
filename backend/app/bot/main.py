from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from app.bot.handlers.callbacks import router as callbacks_router
from app.bot.handlers.menu import router as menu_router
from app.bot.handlers.start import router as start_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.integrations.redis import close_redis

logger = logging.getLogger(__name__)


async def run_bot() -> None:
    configure_logging()
    settings = get_settings()

    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

    bot = Bot(token=settings.telegram_bot_token)
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(start_router)
    dp.include_router(callbacks_router)
    dp.include_router(menu_router)

    logger.info("Telegram bot started")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(run_bot())
