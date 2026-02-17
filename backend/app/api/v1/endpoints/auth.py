from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.responses import success_response
from app.schemas.auth import AuthResponse, LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest, TokenPair
from app.services.auth import AuthService

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
async def login(payload: LoginRequest, request: Request, session: AsyncSession = Depends(get_db_session)):
    service = AuthService(session)
    user, access_token, refresh_token = await service.login(
        login=payload.login,
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
