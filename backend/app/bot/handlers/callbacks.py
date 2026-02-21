from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.bot.keyboards import main_keyboard
from app.bot.runtime import new_session, redis_client
from app.core.enums import EventStatus
from app.schemas.event import EventUpdate
from app.services.events import EventService
from app.services.telegram import TelegramIntegrationService
from app.services.user_timezone import UserTimezoneService
from app.repositories.user import UserRepository

router = Router(name="callbacks")


async def _resolve_user_id(chat_id: int):
    session = await new_session()
    redis = await redis_client()
    async with session:
        try:
            return await TelegramIntegrationService(session, redis).get_user_id_by_chat(chat_id)
        except Exception:
            return None


async def _resolve_user_timezone_name(session, user_id: UUID) -> str:
    user = await UserRepository(session).get_by_id(user_id)
    return UserTimezoneService.resolve_timezone_name(user)


def _uuid_from_hex(value: str) -> UUID:
    return UUID(hex=value)


@router.callback_query(F.data.startswith("ev:"))
async def event_actions(callback: CallbackQuery) -> None:
    parts = callback.data.split(":")
    if len(parts) != 3:
        await callback.answer("Некорректное действие", show_alert=True)
        return

    action = parts[1]
    event_id = _uuid_from_hex(parts[2])
    user_id = await _resolve_user_id(callback.message.chat.id)
    if user_id is None:
        await callback.answer("Аккаунт не привязан", show_alert=True)
        return

    session = await new_session()
    redis = await redis_client()
    async with session:
        service = EventService(session, redis)
        if action == "done":
            event = await service.set_status(user_id, event_id, EventStatus.DONE)
            await callback.message.edit_text(f"✅ Выполнено: {event.title}")
        elif action == "cancel":
            event = await service.set_status(user_id, event_id, EventStatus.CANCELED)
            await callback.message.edit_text(f"❌ Отменено: {event.title}")
        elif action == "delete":
            await service.soft_delete_event(user_id, event_id)
            await callback.message.edit_text("🗑 Событие удалено")

    await callback.answer()


@router.callback_query(F.data.startswith("cf:"))
async def conflict_actions(callback: CallbackQuery) -> None:
    parts = callback.data.split(":")
    if len(parts) < 3:
        await callback.answer("Некорректное действие", show_alert=True)
        return

    user_id = await _resolve_user_id(callback.message.chat.id)
    if user_id is None:
        await callback.answer("Аккаунт не привязан", show_alert=True)
        return

    action = parts[1]
    event_id = _uuid_from_hex(parts[2])

    if action == "ignore":
        await callback.message.edit_text("Конфликт проигнорирован.")
        await callback.answer()
        return

    if action == "pick":
        await callback.message.answer("Выбери новое время в веб-интерфейсе события.", reply_markup=main_keyboard())
        await callback.answer()
        return

    if action == "ok" and len(parts) == 5:
        start_ts = int(parts[3])
        end_ts = int(parts[4])
        start_at = datetime.fromtimestamp(start_ts, tz=timezone.utc)
        end_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)

        session = await new_session()
        redis = await redis_client()
        async with session:
            service = EventService(session, redis)
            timezone_name = await _resolve_user_timezone_name(session, user_id)
            payload = EventUpdate(start_at=start_at, end_at=end_at)
            event = await service.update_event(user_id, event_id, payload)
            tz = ZoneInfo(timezone_name)
            await callback.message.edit_text(
                "Событие перенесено: "
                f"{event.start_at.astimezone(tz).strftime('%d.%m %H:%M')} - {event.end_at.astimezone(tz).strftime('%H:%M')}"
            )
        await callback.answer("Перенос выполнен")
        return

    await callback.answer("Некорректное действие", show_alert=True)
