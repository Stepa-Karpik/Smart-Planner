from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_redis_client
from app.core.config import get_settings
from app.core.responses import success_response
from app.repositories.calendar import CalendarRepository
from app.schemas.document_event import DocumentEventCreate
from app.schemas.event import EventCreate
from app.services.events import EventService

router = APIRouter(prefix="/document-events", tags=["Document Events"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_document_event(
    payload: DocumentEventCreate,
    request: Request,
    x_internal_key: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    settings = get_settings()
    if not settings.planner_internal_api_key or x_internal_key != settings.planner_internal_api_key:
        raise HTTPException(status_code=401, detail="invalid internal key")
    calendars = CalendarRepository(session)
    calendar = await calendars.get_by_title(payload.owner_subject_id, payload.calendar_title)
    if calendar is None:
        calendar = await calendars.create(payload.owner_subject_id, payload.calendar_title, color="#7c3aed", color_dark="#a78bfa")
        await session.commit()
    priority = int(payload.priority) if str(payload.priority).isdigit() else 0
    event = await EventService(session, redis).create_event(payload.owner_subject_id, EventCreate(
        calendar_id=calendar.id,
        title=payload.title,
        description=payload.description,
        start_at=payload.starts_at,
        priority=priority,
    ))
    return success_response(data={"event_id": str(event.id)}, request=request)
