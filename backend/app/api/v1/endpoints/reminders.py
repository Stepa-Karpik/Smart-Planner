from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.responses import success_response
from app.schemas.reminder import ReminderCreate, ReminderRead
from app.services.reminders import ReminderService

router = APIRouter(tags=["Reminders"])


@router.get("/events/{event_id}/reminders")
async def list_reminders(
    event_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    items = await ReminderService(session).list_event_reminders(current_user.id, event_id)
    data = [ReminderRead.model_validate(item).model_dump() for item in items]
    return success_response(data=data, request=request)


@router.post("/events/{event_id}/reminders", status_code=status.HTTP_201_CREATED)
async def create_reminder(
    event_id: UUID,
    payload: ReminderCreate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    item = await ReminderService(session).add_reminder(current_user.id, event_id, payload.offset_minutes)
    return success_response(data=ReminderRead.model_validate(item).model_dump(), request=request)


@router.delete("/reminders/{reminder_id}")
async def cancel_reminder(
    reminder_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    await ReminderService(session).cancel_reminder(current_user.id, reminder_id)
    return success_response(data={"ok": True}, request=request)
