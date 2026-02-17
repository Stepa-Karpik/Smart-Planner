from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from aiogram import Bot

from app.bot.keyboards import conflict_keyboard, reminder_notification_keyboard
from app.core.config import get_settings
from app.core.enums import ReminderStatus, RouteMode
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.integrations.redis import close_redis, get_redis
from app.repositories.event import EventRepository
from app.repositories.reminder import ReminderRepository
from app.repositories.telegram import TelegramRepository
from app.services.feasibility import TravelFeasibilityService
from app.services.routing import RouteService

logger = logging.getLogger(__name__)


async def process_due_reminders(bot: Bot) -> None:
    settings = get_settings()
    redis = await get_redis()

    async with SessionLocal() as session:
        reminder_repo = ReminderRepository(session)
        reminders = await reminder_repo.due_for_delivery(datetime.now(timezone.utc), batch_size=200)

        for reminder in reminders:
            lock_key = f"notif:lock:{reminder.id}"
            locked = await redis.set(lock_key, "1", ex=settings.notif_lock_ttl_sec, nx=True)
            if not locked:
                continue

            event = reminder.event
            user = event.calendar.user
            tg_link = user.telegram_link

            if tg_link is None:
                reminder.status = ReminderStatus.FAILED
                reminder.last_error = "Telegram is not linked"
                continue

            text = f"⏰ Напоминание: {event.title}\n🕒 {event.start_at.isoformat()}"
            if event.location_text:
                text += f"\n📍 {event.location_text}"

            try:
                await bot.send_message(
                    chat_id=tg_link.telegram_chat_id,
                    text=text,
                    reply_markup=reminder_notification_keyboard(
                        event_id_hex=event.id.hex,
                        open_url=f"{settings.app_base_url.rstrip('/')}/events/{event.id}",
                    ),
                )
                reminder.status = ReminderStatus.SENT
                reminder.last_error = None
            except Exception as exc:
                reminder.status = ReminderStatus.FAILED
                reminder.last_error = str(exc)[:1000]

        await session.commit()


async def process_conflicts(bot: Bot) -> None:
    settings = get_settings()
    redis = await get_redis()
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=settings.conflict_horizon_hours)

    async with SessionLocal() as session:
        event_repo = EventRepository(session)
        tg_repo = TelegramRepository(session)
        route_service = RouteService(redis)
        feasibility = TravelFeasibilityService(route_service)

        user_ids = await event_repo.list_users_with_events_in_window(now, horizon)
        for user_id in user_ids:
            tg_link = await tg_repo.get_link_by_user(user_id)
            if tg_link is None:
                continue

            events = list(await event_repo.list_user_events_in_range(user_id, now, horizon))
            conflicts = await feasibility.check(events, mode=RouteMode.PUBLIC_TRANSPORT)
            for conflict in conflicts:
                token = f"{user_id}:{conflict.next_event_id}:{conflict.suggested_start_at}"
                lock_key = f"conflict:lock:{token}"
                if not await redis.set(lock_key, "1", ex=3600, nx=True):
                    continue

                event_hex = UUID(conflict.next_event_id).hex
                suggested_start = int(datetime.fromisoformat(conflict.suggested_start_at).timestamp())
                suggested_end = int(datetime.fromisoformat(conflict.suggested_end_at).timestamp())

                text = (
                    f"Ты не успеваешь на {conflict.next_event_title}. "
                    f"Предлагаю перенести на {conflict.suggested_start_at}."
                )
                if conflict.faster_mode:
                    text += f" Более быстрый транспорт: {conflict.faster_mode.value}."

                await bot.send_message(
                    chat_id=tg_link.telegram_chat_id,
                    text=text,
                    reply_markup=conflict_keyboard(event_hex, suggested_start, suggested_end),
                )


async def worker_loop() -> None:
    configure_logging()
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

    bot = Bot(token=settings.telegram_bot_token)
    logger.info("Notification worker started")
    try:
        while True:
            try:
                await process_due_reminders(bot)
                await process_conflicts(bot)
            except Exception:
                logger.exception("Worker iteration failed")
            await asyncio.sleep(settings.worker_poll_interval_sec)
    finally:
        await bot.session.close()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(worker_loop())
