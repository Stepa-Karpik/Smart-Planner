from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.responses import success_response
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIIngestTaskRequest,
    AIIngestTaskResponse,
    AIMessageRead,
    AISessionRead,
)
from app.services.ai.service import AIService
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.routing import RouteService

router = APIRouter(prefix="/ai", tags=["AI"])


def build_ai_service(session: AsyncSession, redis: Redis) -> AIService:
    event_service = EventService(session, redis)
    route_service = RouteService(redis)
    feasibility_service = TravelFeasibilityService(route_service)
    return AIService(session=session, redis=redis, event_service=event_service, feasibility_service=feasibility_service)


@router.post("/chat")
async def ai_chat(
    payload: AIChatRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    session_id, answer = await service.chat(current_user.id, payload.message, payload.session_id)
    data = AIChatResponse(session_id=session_id, answer=answer)
    return success_response(data=data.model_dump(), request=request)


@router.post("/chat/stream")
async def ai_chat_stream(
    payload: AIChatRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    generator = service.stream_chat(current_user.id, payload.message, payload.session_id)
    return StreamingResponse(generator, media_type="text/event-stream")


@router.post("/ingest-task")
async def ai_ingest_task(
    payload: AIIngestTaskRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    job = await service.ingest_task(current_user.id, payload.source, payload.payload_ref, payload.text)
    data = AIIngestTaskResponse(job_id=job.id, status=job.status)
    return success_response(data=data.model_dump(), request=request)


@router.post("/voice/transcribe")
async def ai_voice_transcribe(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    content = await file.read()
    text = await service.transcribe_voice(content, file.filename or "voice.ogg")
    return success_response(data={"text": text}, request=request)


@router.get("/sessions")
async def ai_sessions(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    items = await service.list_sessions(current_user.id)
    data = [AISessionRead.model_validate(item).model_dump() for item in items]
    return success_response(data=data, request=request)


@router.get("/sessions/{session_id}/messages")
async def ai_session_messages(
    session_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    items = await service.list_messages(current_user.id, session_id)
    data = [AIMessageRead.model_validate(item).model_dump() for item in items]
    return success_response(data=data, request=request)
