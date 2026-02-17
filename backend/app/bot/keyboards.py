from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup


def unlinked_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Привязать аккаунт")],
            [KeyboardButton(text="Помощь")],
        ],
        resize_keyboard=True,
    )


def main_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📅 Сегодня"), KeyboardButton(text="🗓 Ближайшие")],
            [KeyboardButton(text="➕ Добавить"), KeyboardButton(text="⚙ Настройки")],
        ],
        resize_keyboard=True,
    )


def reminder_choice_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="10м", callback_data="addrem:10"),
                InlineKeyboardButton(text="30м", callback_data="addrem:30"),
                InlineKeyboardButton(text="60м", callback_data="addrem:60"),
            ],
            [InlineKeyboardButton(text="Без напоминаний", callback_data="addrem:none")],
        ]
    )


def create_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Создать", callback_data="add:confirm"),
                InlineKeyboardButton(text="❌ Отмена", callback_data="add:cancel"),
            ]
        ]
    )


def event_actions_keyboard(event_id_hex: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Выполнено", callback_data=f"ev:done:{event_id_hex}"),
                InlineKeyboardButton(text="❌ Отменить", callback_data=f"ev:cancel:{event_id_hex}"),
            ],
            [InlineKeyboardButton(text="🗑 Удалить", callback_data=f"ev:delete:{event_id_hex}")],
        ]
    )


def reminder_notification_keyboard(event_id_hex: str, open_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Открыть в вебе", url=open_url)],
            [InlineKeyboardButton(text="Выполнено", callback_data=f"ev:done:{event_id_hex}")],
        ]
    )


def conflict_keyboard(event_hex: str, start_ts: int, end_ts: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Перенести", callback_data=f"cf:ok:{event_hex}:{start_ts}:{end_ts}")],
            [InlineKeyboardButton(text="🕒 Выбрать другое время", callback_data=f"cf:pick:{event_hex}")],
            [InlineKeyboardButton(text="❌ Игнорировать", callback_data=f"cf:ignore:{event_hex}")],
        ]
    )
