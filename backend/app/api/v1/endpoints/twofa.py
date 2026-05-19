from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user
from app.core.responses import success_response
from app.schemas.twofa import (
    TotpDisableRequest,
    TotpSetupResponse,
    TotpVerifySetupRequest,
    TwoFASetMethodRequest,
    TwoFAPendingStatusResponse,
    TwoFASettingsResponse,
    TwoFATelegramPendingResponse,
)
from app.services.identity_twofa_client import IdentityTwoFAClient

router = APIRouter(prefix="/integrations/twofa", tags=["Integrations"])


@router.get("")
async def get_twofa_settings(request: Request, current_user=Depends(get_current_user)):
    data = TwoFASettingsResponse(**(await IdentityTwoFAClient().get_settings(subject_id=str(current_user.id))))
    return success_response(data=data.model_dump(), request=request)


@router.post("/method")
async def set_twofa_method(payload: TwoFASetMethodRequest, request: Request, current_user=Depends(get_current_user)):
    await IdentityTwoFAClient().set_method(subject_id=str(current_user.id), method=payload.method)
    return success_response(data={"ok": True}, request=request)


@router.post("/telegram/enable-request")
async def request_enable_telegram_twofa(request: Request, current_user=Depends(get_current_user)):
    payload = await IdentityTwoFAClient().request_telegram_change(subject_id=str(current_user.id), action="enable")
    data = TwoFATelegramPendingResponse(
        pending_id=str(payload["pending_id"]),
        action="enable",
        status=payload["status"],
        expires_at=datetime.fromisoformat(payload["expires_at"]),
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/telegram/disable-request")
async def request_disable_telegram_twofa(request: Request, current_user=Depends(get_current_user)):
    payload = await IdentityTwoFAClient().request_telegram_change(subject_id=str(current_user.id), action="disable")
    data = TwoFATelegramPendingResponse(
        pending_id=str(payload["pending_id"]),
        action="disable",
        status=payload["status"],
        expires_at=datetime.fromisoformat(payload["expires_at"]),
    )
    return success_response(data=data.model_dump(), request=request)


@router.get("/pending/{pending_id}")
async def get_twofa_pending_status(pending_id: str, request: Request, current_user=Depends(get_current_user)):
    payload = await IdentityTwoFAClient().get_pending_status(subject_id=str(current_user.id), pending_id=pending_id)
    expires_at = datetime.fromisoformat(payload["expires_at"]) if payload.get("expires_at") else None
    data = TwoFAPendingStatusResponse(
        pending_id=str(payload.get("pending_id", pending_id)),
        method=str(payload.get("method", "telegram")),
        action=str(payload.get("action", "unknown")),
        status=payload.get("status", "expired"),
        expires_at=expires_at,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/totp/setup")
async def setup_totp(request: Request, current_user=Depends(get_current_user)):
    payload = await IdentityTwoFAClient().create_totp_setup(subject_id=str(current_user.id))
    data = TotpSetupResponse(**payload)
    return success_response(data=data.model_dump(), request=request)


@router.post("/totp/verify-setup")
async def verify_totp_setup(payload: TotpVerifySetupRequest, request: Request, current_user=Depends(get_current_user)):
    await IdentityTwoFAClient().verify_totp_setup(subject_id=str(current_user.id), pending_id=str(payload.pending_id), code=payload.code)
    return success_response(data={"ok": True}, request=request)


@router.post("/totp/disable")
async def disable_totp(payload: TotpDisableRequest, request: Request, current_user=Depends(get_current_user)):
    await IdentityTwoFAClient().disable_totp(subject_id=str(current_user.id), code=payload.code)
    return success_response(data={"ok": True}, request=request)
