from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.filters.command import CommandObject
from aiogram.types import Message

from app.bot.keyboards import main_keyboard, unlinked_keyboard
from app.bot.runtime import new_session, redis_client
from app.services.telegram import TelegramIntegrationService

router = Router(name="start")


@router.message(CommandStart())
async def start_handler(message: Message, command: CommandObject) -> None:
    chat_id = message.chat.id
    username = message.from_user.username if message.from_user else None
    session = await new_session()
    redis = await redis_client()

    async with session:
        tg_service = TelegramIntegrationService(session, redis)

        if command.args:
            try:
                await tg_service.consume_start_code(command.args.strip(), chat_id=chat_id, telegram_username=username)
                await message.answer(
                    "Аккаунт успешно привязан. Используй кнопки ниже.",
                    reply_markup=main_keyboard(),
                )
                return
            except Exception:
                await message.answer(
                    "Код привязки недействителен или истек. Получи новый код в веб-приложении.",
                    reply_markup=unlinked_keyboard(),
                )
                return

        try:
            await tg_service.get_user_id_by_chat(chat_id)
            await message.answer("С возвращением. Выбери действие на клавиатуре.", reply_markup=main_keyboard())
        except Exception:
            await message.answer(
                "Привет! Сначала привяжи аккаунт Smart Planner через deep-link из веб-приложения.",
                reply_markup=unlinked_keyboard(),
            )
