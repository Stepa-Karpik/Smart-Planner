from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, get_redis_client
from app.core.config import get_settings
from app.core.responses import success_response
from app.schemas.ai import (
    AssistantModeRead,
    AssistantModeUpdate,
    AIChatRequest,
    AIChatResponse,
    AIIngestTaskRequest,
    AIIngestTaskResponse,
    AIMessageRead,
    AISessionCreateRequest,
    AISessionRead,
)
from app.services.ai.service import AIService
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.routing import RouteService

router = APIRouter(prefix="/ai", tags=["AI"])
settings = get_settings()


def build_ai_service(session: AsyncSession, redis: Redis) -> AIService:
    event_service = EventService(session, redis)
    route_service = RouteService(redis)
    feasibility_service = TravelFeasibilityService(route_service)
    return AIService(session=session, redis=redis, event_service=event_service, feasibility_service=feasibility_service)


def resolve_actor_role(username: str | None) -> str:
    normalized = (username or "").strip().lower()
    if normalized and normalized in settings.admin_usernames:
        return "admin"
    return "user"


@router.post("/chat")
async def ai_chat(
    payload: AIChatRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    result = await service.chat(
        user_id=current_user.id,
        message=payload.message,
        session_id=payload.session_id,
        chat_type=payload.chat_type,
        selected_option_id=payload.selected_option_id,
        actor_role=resolve_actor_role(getattr(current_user, "username", None)),
    )
    data = AIChatResponse(
        session_id=result.session_id,
        chat_type=result.chat_type,
        display_index=result.display_index,
        answer=result.answer,
        mode=result.mode,
        intent=result.intent,
        fallback_reason_code=result.fallback_reason_code,
        requires_user_input=result.requires_user_input,
        clarifying_question=result.clarifying_question,
        options=result.options or [],
        memory_suggestions=result.memory_suggestions or [],
        planner_summary=result.planner_summary or {},
        response_meta=result.response_meta,
    )
    return success_response(data=data.model_dump(), request=request)


@router.post("/chat/stream")
async def ai_chat_stream(
    payload: AIChatRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    generator = service.stream_chat(
        user_id=current_user.id,
        message=payload.message,
        session_id=payload.session_id,
        chat_type=payload.chat_type,
        selected_option_id=payload.selected_option_id,
        actor_role=resolve_actor_role(getattr(current_user, "username", None)),
    )
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


@router.post("/sessions")
async def ai_create_session(
    payload: AISessionCreateRequest,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    created = await service.create_session(current_user.id, payload.chat_type)
    data = AISessionRead.model_validate(created).model_dump()
    return success_response(data=data, request=request)


@router.delete("/sessions/{session_id}")
async def ai_delete_session(
    session_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    deleted = await service.delete_session(current_user.id, session_id)
    data = AISessionRead.model_validate(deleted).model_dump()
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


@router.get("/mode")
async def ai_default_mode(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    mode, active_session = await service.get_mode_state(current_user.id, ensure_active=True)
    data = AssistantModeRead(
        default_mode=mode,
        active_session_id=active_session.id if active_session else None,
        active_chat_type=active_session.chat_type if active_session else None,
    )
    return success_response(data=data.model_dump(), request=request)


@router.patch("/mode")
async def ai_set_default_mode(
    payload: AssistantModeUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis_client),
):
    service = build_ai_service(session, redis)
    mode, active_session = await service.set_default_mode(
        current_user.id,
        payload.default_mode,
        session_id=payload.session_id,
        create_new_chat=payload.create_new_chat,
    )
    data = AssistantModeRead(
        default_mode=mode,
        active_session_id=active_session.id if active_session else None,
        active_chat_type=active_session.chat_type if active_session else None,
    )
    return success_response(data=data.model_dump(), request=request)
