from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.responses import success_response
from app.schemas.calendar import CalendarCreate, CalendarRead, CalendarUpdate
from app.services.calendars import CalendarService

router = APIRouter(prefix="/calendars", tags=["Calendars"])


@router.get("")
async def list_calendars(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    items = await CalendarService(session).list_calendars(current_user.id)
    data = [CalendarRead.model_validate(item).model_dump() for item in items]
    return success_response(data=data, request=request)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_calendar(
    payload: CalendarCreate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    item = await CalendarService(session).create_calendar(current_user.id, payload.title, payload.color)
    return success_response(data=CalendarRead.model_validate(item).model_dump(), request=request)


@router.patch("/{calendar_id}")
async def update_calendar(
    calendar_id: UUID,
    payload: CalendarUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    item = await CalendarService(session).update_calendar(
        current_user.id,
        calendar_id,
        payload.title,
        payload.color,
    )
    return success_response(data=CalendarRead.model_validate(item).model_dump(), request=request)


@router.delete("/{calendar_id}")
async def delete_calendar(
    calendar_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    await CalendarService(session).delete_calendar(current_user.id, calendar_id)
    return success_response(data={"ok": True}, request=request)
