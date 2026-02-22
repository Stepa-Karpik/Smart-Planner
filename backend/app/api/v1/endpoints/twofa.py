from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.exceptions import ValidationAppError
from app.core.responses import success_response
from app.schemas.twofa import (
    TotpDisableRequest,
    TotpSetupResponse,
    TotpVerifySetupRequest,
    TwoFAPendingStatusResponse,
    TwoFASettingsResponse,
    TwoFATelegramPendingResponse,
)
from app.services.twofa import TwoFactorAuthService

router = APIRouter(prefix="/integrations/twofa", tags=["Integrations"])


@router.get("")
async def get_twofa_settings(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    data = TwoFASettingsResponse(**(await TwoFactorAuthService(session, redis).get_user_twofa_settings(current_user.id)))
    return success_response(data=data.model_dump(), request=request)


@router.post("/telegram/enable-request")
async def request_enable_telegram_twofa(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    payload = await TwoFactorAuthService(session, redis).request_telegram_method_change(current_user.id, "enable")
    expires_at = TwoFactorAuthService._parse_dt(payload.get("expires_at")) or datetime.now(timezone.utc)
    data = TwoFATelegramPendingResponse(
        pending_id=str(payload["pending_id"]),
        action="enable",
        status=payload["status"],
        expires_at=expires_at,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/telegram/disable-request")
async def request_disable_telegram_twofa(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    payload = await TwoFactorAuthService(session, redis).request_telegram_method_change(current_user.id, "disable")
    expires_at = TwoFactorAuthService._parse_dt(payload.get("expires_at")) or datetime.now(timezone.utc)
    data = TwoFATelegramPendingResponse(
        pending_id=str(payload["pending_id"]),
        action="disable",
        status=payload["status"],
        expires_at=expires_at,
    )
    return success_response(data=data.model_dump(), request=request)


@router.get("/pending/{pending_id}")
async def get_twofa_pending_status(
    pending_id: str,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    try:
        pending_uuid = UUID(pending_id)
    except Exception as exc:  # noqa: BLE001
        raise ValidationAppError("Invalid pending id") from exc
    payload = await TwoFactorAuthService(session, redis).get_pending_action_status(current_user.id, pending_uuid)
    expires_at = TwoFactorAuthService._parse_dt(payload.get("expires_at"))
    data = TwoFAPendingStatusResponse(
        pending_id=str(payload.get("pending_id", pending_id)),
        method=str(payload.get("method", "telegram")),
        action=str(payload.get("action", "unknown")),
        status=payload.get("status", "expired"),
        expires_at=expires_at,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/totp/setup")
async def setup_totp(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    payload = await TwoFactorAuthService(session, redis).create_totp_setup(current_user.id)
    data = TotpSetupResponse(**payload)
    return success_response(data=data.model_dump(), request=request)


@router.post("/totp/verify-setup")
async def verify_totp_setup(
    payload: TotpVerifySetupRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    await TwoFactorAuthService(session, redis).verify_totp_setup(current_user.id, payload.pending_id, payload.code)
    return success_response(data={"ok": True}, request=request)


@router.post("/totp/disable")
async def disable_totp(
    payload: TotpDisableRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    await TwoFactorAuthService(session, redis).disable_totp(current_user.id, payload.code)
    return success_response(data={"ok": True}, request=request)
