from __future__ import annotations

import io
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.bot.keyboards import (
    create_confirm_keyboard,
    event_actions_keyboard,
    main_keyboard,
    reminder_choice_keyboard,
    unlinked_keyboard,
)
from app.bot.runtime import new_session, redis_client
from app.bot.states import AddEventStates
from app.schemas.event import EventCreate
from app.services.ai.service import AIService
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.reminders import ReminderService
from app.services.routing import RouteService
from app.services.telegram import TelegramIntegrationService
from app.services.user_timezone import UserTimezoneService
from app.repositories.user import UserRepository

router = Router(name="menu")


def _chat_session_key(chat_id: int) -> str:
    return f"tg:ai:session:{chat_id}"


def parse_datetime_input(raw: str, timezone_name: str) -> datetime | None:
    raw = raw.strip()
    tz = ZoneInfo(timezone_name)
    for fmt in ["%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M"]:
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.replace(tzinfo=tz).astimezone(timezone.utc)
        except ValueError:
            continue
    return None


async def _resolve_user_timezone_name(session, user_id: UUID) -> str:
    user = await UserRepository(session).get_by_id(user_id)
    return UserTimezoneService.resolve_timezone_name(user)


def _format_local_range(start_at: datetime, end_at: datetime, timezone_name: str, include_date: bool = False) -> str:
    tz = ZoneInfo(timezone_name)
    start_local = start_at.astimezone(tz)
    end_local = end_at.astimezone(tz)
    if include_date:
        return f"{start_local.strftime('%d.%m %H:%M')} - {end_local.strftime('%H:%M')}"
    return f"{start_local.strftime('%H:%M')} - {end_local.strftime('%H:%M')}"


async def resolve_user_id(chat_id: int):
    session = await new_session()
    redis = await redis_client()
    async with session:
        try:
            return await TelegramIntegrationService(session, redis).get_user_id_by_chat(chat_id)
        except Exception:
            return None


async def resolve_chat_ai_session(chat_id: int) -> UUID | None:
    redis = await redis_client()
    raw_value = await redis.get(_chat_session_key(chat_id))
    if not raw_value:
        return None
    try:
        return UUID(str(raw_value))
    except Exception:
        await redis.delete(_chat_session_key(chat_id))
        return None


async def store_chat_ai_session(chat_id: int, session_id: UUID) -> None:
    redis = await redis_client()
    await redis.setex(_chat_session_key(chat_id), 60 * 60 * 24 * 30, str(session_id))


@router.message(F.text == "Привязать аккаунт")
async def bind_info(message: Message) -> None:
    await message.answer(
        "Открой веб-приложение и вызови POST /api/v1/integrations/telegram/start, "
        "после чего перейди по deep-link.",
        reply_markup=unlinked_keyboard(),
    )


@router.message(F.text == "Помощь")
async def help_message(message: Message) -> None:
    await message.answer(
        "Доступные кнопки:\n"
        "📅 Сегодня - события на сегодня\n"
        "🗓 Ближайшие - события на 48 часов\n"
        "➕ Добавить - мастер создания события\n"
        "⚙ Настройки - статус интеграции"
    )


@router.message(F.text == "⚙ Настройки")
async def settings_menu(message: Message) -> None:
    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Аккаунт не привязан.", reply_markup=unlinked_keyboard())
        return

    session = await new_session()
    redis = await redis_client()
    async with session:
        status_payload = await TelegramIntegrationService(session, redis).status(user_id)
        await message.answer(
            f"Telegram linked: {status_payload['is_linked']}\n"
            f"Confirmed: {status_payload['is_confirmed']}\n"
            f"Username: {status_payload['telegram_username']}",
            reply_markup=main_keyboard(),
        )


@router.message(F.text == "📅 Сегодня")
async def today_events(message: Message) -> None:
    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Сначала привяжи аккаунт.", reply_markup=unlinked_keyboard())
        return

    session = await new_session()
    redis = await redis_client()
    async with session:
        service = EventService(session, redis)
        timezone_name = await _resolve_user_timezone_name(session, user_id)
        events = await service.get_today_events(user_id)
        if not events:
            await message.answer("На сегодня событий нет.", reply_markup=main_keyboard())
            return

        for event in events[:20]:
            text = f"{_format_local_range(event.start_at, event.end_at, timezone_name)}\n{event.title}"
            if event.location_text:
                text += f"\n📍 {event.location_text}"
            await message.answer(text, reply_markup=event_actions_keyboard(event.id.hex))


@router.message(F.text == "🗓 Ближайшие")
async def upcoming_events(message: Message) -> None:
    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Сначала привяжи аккаунт.", reply_markup=unlinked_keyboard())
        return

    session = await new_session()
    redis = await redis_client()
    async with session:
        service = EventService(session, redis)
        timezone_name = await _resolve_user_timezone_name(session, user_id)
        events = await service.get_upcoming_events(user_id, hours=48)
        if not events:
            await message.answer("Ближайших событий нет.", reply_markup=main_keyboard())
            return

        for event in events[:20]:
            text = f"{_format_local_range(event.start_at, event.end_at, timezone_name, include_date=True)}\n{event.title}"
            if event.location_text:
                text += f"\n📍 {event.location_text}"
            await message.answer(text, reply_markup=event_actions_keyboard(event.id.hex))


@router.message(F.text == "➕ Добавить")
async def add_event_start(message: Message, state: FSMContext) -> None:
    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Сначала привяжи аккаунт.", reply_markup=unlinked_keyboard())
        return

    await state.clear()
    await state.update_data(user_id=str(user_id))
    await state.set_state(AddEventStates.waiting_title)
    await message.answer("Введи название события:")


@router.message(AddEventStates.waiting_title)
async def add_event_title(message: Message, state: FSMContext) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("Название не должно быть пустым. Попробуй еще раз.")
        return
    await state.update_data(title=title)
    await state.set_state(AddEventStates.waiting_start)
    data = await state.get_data()
    timezone_name = "Europe/Moscow"
    try:
        user_id = UUID(data["user_id"])
        session = await new_session()
        async with session:
            timezone_name = await _resolve_user_timezone_name(session, user_id)
    except Exception:
        timezone_name = "Europe/Moscow"
    await state.update_data(timezone_name=timezone_name)
    await message.answer(f"Укажи начало в формате YYYY-MM-DD HH:MM (часовой пояс: {timezone_name}).")


@router.message(AddEventStates.waiting_start)
async def add_event_start_time(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    timezone_name = str(data.get("timezone_name") or "Europe/Moscow")
    parsed = parse_datetime_input(message.text or "", timezone_name)
    if parsed is None:
        await message.answer("Неверный формат. Пример: 2026-02-18 15:30")
        return
    await state.update_data(start_at=parsed.isoformat())
    await state.set_state(AddEventStates.waiting_end)
    await message.answer(f"Укажи конец в формате YYYY-MM-DD HH:MM (часовой пояс: {timezone_name}).")


@router.message(AddEventStates.waiting_end)
async def add_event_end_time(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    timezone_name = str(data.get("timezone_name") or "Europe/Moscow")
    parsed = parse_datetime_input(message.text or "", timezone_name)
    if parsed is None:
        await message.answer("Неверный формат. Пример: 2026-02-18 16:30")
        return

    start_at = datetime.fromisoformat(data["start_at"])
    if parsed <= start_at:
        await message.answer("Конец должен быть позже начала.")
        return

    await state.update_data(end_at=parsed.isoformat())
    await state.set_state(AddEventStates.waiting_location)
    await message.answer("Укажи место (или '-' если без места).")


@router.message(AddEventStates.waiting_location)
async def add_event_location(message: Message, state: FSMContext) -> None:
    location = (message.text or "").strip()
    if location == "-":
        location = None
    await state.update_data(location_text=location)
    await state.set_state(AddEventStates.waiting_reminder)
    await message.answer("Выбери напоминание:", reply_markup=reminder_choice_keyboard())


@router.callback_query(AddEventStates.waiting_reminder, F.data.startswith("addrem:"))
async def add_event_reminder(callback: CallbackQuery, state: FSMContext) -> None:
    value = callback.data.split(":", 1)[1]
    reminder = None if value == "none" else int(value)
    await state.update_data(reminder=reminder)

    data = await state.get_data()
    timezone_name = str(data.get("timezone_name") or "Europe/Moscow")
    start_value = datetime.fromisoformat(data["start_at"])
    end_value = datetime.fromisoformat(data["end_at"])
    summary = (
        f"Проверь данные:\n"
        f"Название: {data['title']}\n"
        f"Начало: {start_value.astimezone(ZoneInfo(timezone_name)).strftime('%Y-%m-%d %H:%M')}\n"
        f"Конец: {end_value.astimezone(ZoneInfo(timezone_name)).strftime('%Y-%m-%d %H:%M')}\n"
        f"Место: {data.get('location_text') or '-'}\n"
        f"Напоминание: {data.get('reminder') or 'нет'}"
    )
    await state.set_state(AddEventStates.waiting_confirm)
    await callback.message.answer(summary, reply_markup=create_confirm_keyboard())
    await callback.answer()


@router.callback_query(AddEventStates.waiting_confirm, F.data == "add:cancel")
async def add_event_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.answer("Создание отменено.", reply_markup=main_keyboard())
    await callback.answer()


@router.callback_query(AddEventStates.waiting_confirm, F.data == "add:confirm")
async def add_event_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    user_id = UUID(data["user_id"])
    timezone_name = str(data.get("timezone_name") or "Europe/Moscow")

    session = await new_session()
    redis = await redis_client()
    async with session:
        event_service = EventService(session, redis)
        payload = EventCreate(
            title=data["title"],
            start_at=datetime.fromisoformat(data["start_at"]),
            end_at=datetime.fromisoformat(data["end_at"]),
            location_text=data.get("location_text"),
            priority=1,
        )
        event = await event_service.create_event(user_id=user_id, payload=payload)

        reminder_offset = data.get("reminder")
        if reminder_offset:
            await ReminderService(session).add_reminder(user_id=user_id, event_id=event.id, offset_minutes=reminder_offset)

    await state.clear()
    start_label = event.start_at.astimezone(ZoneInfo(timezone_name)).strftime("%d.%m.%Y %H:%M")
    location_suffix = f" Место: {event.location_text}." if event.location_text else ""
    await callback.message.answer(
        f"Создал событие \"{event.title}\" в {start_label}.{location_suffix}",
        reply_markup=main_keyboard(),
    )
    await callback.answer()


@router.message(F.voice)
async def voice_to_ai(message: Message) -> None:
    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Сначала привяжи аккаунт.", reply_markup=unlinked_keyboard())
        return

    session = await new_session()
    redis = await redis_client()
    chat_session_id = await resolve_chat_ai_session(message.chat.id)
    async with session:
        file = await message.bot.get_file(message.voice.file_id)
        buffer = io.BytesIO()
        await message.bot.download_file(file.file_path, destination=buffer)
        voice_bytes = buffer.getvalue()

        event_service = EventService(session, redis)
        route_service = RouteService(redis)
        feasibility_service = TravelFeasibilityService(route_service)
        ai_service = AIService(session, redis, event_service, feasibility_service)

        text = await ai_service.transcribe_voice(voice_bytes, "voice.ogg")
        if not text:
            await message.answer("Не удалось распознать голосовое.")
            return

        chat_result = await ai_service.chat(user_id=user_id, message=text, session_id=chat_session_id)
        await store_chat_ai_session(message.chat.id, chat_result.session_id)
        await message.answer(f"🎤 {text}\n\n{chat_result.answer}")


@router.message(F.text)
async def free_text_ai(message: Message) -> None:
    if message.text in {"📅 Сегодня", "🗓 Ближайшие", "➕ Добавить", "⚙ Настройки", "Привязать аккаунт", "Помощь"}:
        return

    user_id = await resolve_user_id(message.chat.id)
    if user_id is None:
        await message.answer("Нажми /start и привяжи аккаунт через deep-link.", reply_markup=unlinked_keyboard())
        return

    session = await new_session()
    redis = await redis_client()
    chat_session_id = await resolve_chat_ai_session(message.chat.id)
    async with session:
        event_service = EventService(session, redis)
        route_service = RouteService(redis)
        feasibility_service = TravelFeasibilityService(route_service)
        ai_service = AIService(session, redis, event_service, feasibility_service)
        chat_result = await ai_service.chat(user_id=user_id, message=message.text, session_id=chat_session_id)
        await store_chat_ai_session(message.chat.id, chat_result.session_id)
        await message.answer(chat_result.answer, reply_markup=main_keyboard())
