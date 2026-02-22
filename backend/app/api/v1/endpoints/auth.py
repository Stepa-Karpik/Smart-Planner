from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_redis_client
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.responses import success_response
from app.schemas.auth import AuthResponse, LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest, TokenPair
from app.schemas.twofa import (
    LoginTwoFAChallenge,
    LoginTwoFASessionStatusResponse,
    LoginTwoFATelegramSessionRequest,
    LoginTwoFATotpVerifyRequest,
)
from app.services.auth import AuthService
from app.services.twofa import TwoFactorAuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, session: AsyncSession = Depends(get_db_session)):
    service = AuthService(session)
    user, access_token, refresh_token = await service.register(
        email=payload.email,
        username=payload.username,
        password=payload.password,
    )
    data = AuthResponse(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        tokens=TokenPair(access_token=access_token, refresh_token=refresh_token),
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    auth_service = AuthService(session)
    user = await auth_service.authenticate_user(
        login=payload.login,
        password=payload.password,
    )
    twofa_method = (getattr(user, "twofa_method", "none") or "none").lower()
    if twofa_method in {"telegram", "totp"}:
        challenge_payload = await TwoFactorAuthService(session, redis).create_login_twofa_session(user.id, twofa_method)
        data = LoginTwoFAChallenge(**challenge_payload)
        return success_response(data=data.model_dump(), request=request)

    access_token, refresh_token = await auth_service.issue_tokens(user.id)
    await session.commit()
    data = AuthResponse(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        tokens=TokenPair(access_token=access_token, refresh_token=refresh_token),
        requires_twofa=False,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/refresh")
async def refresh(payload: RefreshRequest, request: Request, session: AsyncSession = Depends(get_db_session)):
    service = AuthService(session)
    user, access_token, refresh_token = await service.refresh(payload.refresh_token)
    data = AuthResponse(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        tokens=TokenPair(access_token=access_token, refresh_token=refresh_token),
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/logout")
async def logout(payload: LogoutRequest, request: Request, session: AsyncSession = Depends(get_db_session)):
    service = AuthService(session)
    await service.logout(payload.refresh_token)
    return success_response(data={"ok": True}, request=request)


@router.post("/twofa/totp/verify")
async def verify_login_totp(
    payload: LoginTwoFATotpVerifyRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    twofa = TwoFactorAuthService(session, redis)
    auth = AuthService(session)
    user_id = await twofa.verify_login_totp(payload.twofa_session_id, payload.code)
    user = await auth.users.get_by_id(user_id)
    if user is None:
        raise NotFoundError("User not found")
    access_token, refresh_token = await auth.issue_tokens(user.id)
    await session.commit()
    data = AuthResponse(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        tokens=TokenPair(access_token=access_token, refresh_token=refresh_token),
        requires_twofa=False,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/twofa/telegram/request")
async def request_login_telegram_confirmation(
    payload: LoginTwoFATelegramSessionRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    twofa = TwoFactorAuthService(session, redis)
    status_payload = await twofa.request_telegram_login_confirmation(payload.twofa_session_id)
    expires_at = TwoFactorAuthService._parse_dt(status_payload.get("expires_at"))
    if expires_at is None:
        raise ValidationAppError("Invalid 2FA session expiration")
    data = LoginTwoFASessionStatusResponse(
        twofa_session_id=str(status_payload["twofa_session_id"]),
        twofa_method="telegram",
        status=status_payload["status"],
        expires_at=expires_at,
        sent_to_telegram=bool(status_payload.get("sent_to_telegram", False)),
    )
    return success_response(data=data.model_dump(), request=request)


@router.get("/twofa/session/{twofa_session_id}")
async def get_login_twofa_session_status(
    twofa_session_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    twofa = TwoFactorAuthService(session, redis)
    status_payload = await twofa.get_login_twofa_session_status(twofa_session_id)
    expires_at = TwoFactorAuthService._parse_dt(status_payload.get("expires_at"))
    if expires_at is None:
        raise ValidationAppError("Invalid 2FA session expiration")
    data = LoginTwoFASessionStatusResponse(
        twofa_session_id=str(status_payload["twofa_session_id"]),
        twofa_method=status_payload["twofa_method"],
        status=status_payload["status"],
        expires_at=expires_at,
        sent_to_telegram=bool(status_payload.get("sent_to_telegram", False)),
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/twofa/telegram/complete")
async def complete_login_telegram_confirmation(
    payload: LoginTwoFATelegramSessionRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    twofa = TwoFactorAuthService(session, redis)
    auth = AuthService(session)
    user_id = await twofa.complete_login_telegram(payload.twofa_session_id)
    user = await auth.users.get_by_id(user_id)
    if user is None:
        raise NotFoundError("User not found")
    access_token, refresh_token = await auth.issue_tokens(user.id)
    await session.commit()
    data = AuthResponse(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        tokens=TokenPair(access_token=access_token, refresh_token=refresh_token),
        requires_twofa=False,
    )
    return success_response(data=data.model_dump(), request=request)
