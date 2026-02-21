from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.responses import success_response
from app.schemas.profile import PasswordChangeRequest, ProfileRead, ProfileUpdate
from app.services.profile import ProfileService
from app.services.user_timezone import UserTimezoneService

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("")
async def get_profile(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    user = await ProfileService(session).get_profile(current_user.id)
    data = ProfileRead(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        map_provider=user.map_provider,
        home_location_text=user.home_location_text,
        home_location_lat=user.home_location_lat,
        home_location_lon=user.home_location_lon,
        home_location_source=user.home_location_source,
        timezone=UserTimezoneService.resolve_timezone_name(user),
    )
    return success_response(data=data.model_dump(), request=request)


@router.patch("")
async def update_profile(
    payload: ProfileUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    user = await ProfileService(session).update_profile(current_user.id, payload)
    data = ProfileRead(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        default_route_mode=user.default_route_mode,
        map_provider=user.map_provider,
        home_location_text=user.home_location_text,
        home_location_lat=user.home_location_lat,
        home_location_lon=user.home_location_lon,
        home_location_source=user.home_location_source,
        timezone=UserTimezoneService.resolve_timezone_name(user),
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/password")
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    await ProfileService(session).change_password(current_user.id, payload.current_password, payload.new_password)
    return success_response(data={"ok": True}, request=request)
