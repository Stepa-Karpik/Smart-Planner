from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.responses import success_response
from app.schemas.integration import TelegramStartResponse, TelegramStatusResponse
from app.services.telegram import TelegramIntegrationService

router = APIRouter(prefix="/integrations/telegram", tags=["Telegram"])


@router.post("/start")
async def generate_start_link(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = TelegramIntegrationService(session, redis)
    deep_link, desktop_link, expires_at = await service.generate_start_link(current_user.id)
    data = TelegramStartResponse(
        deep_link=deep_link,
        desktop_link=desktop_link,
        expires_at=expires_at,
        instruction="Открой ссылку и нажми Start в Telegram. Для ручного запуска допустима только /start <code>.",
    )
    return success_response(data=data.model_dump(), request=request)


@router.get("/status")
async def telegram_status(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    status_payload = await TelegramIntegrationService(session, redis).status(current_user.id)
    data = TelegramStatusResponse(**status_payload)
    return success_response(data=data.model_dump(), request=request)


@router.delete("")
async def telegram_unlink(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    await TelegramIntegrationService(session, redis).unlink(current_user.id)
    return success_response(data={"ok": True}, request=request)
