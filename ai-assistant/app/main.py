from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_session
from app.models import AdminKbPatch, KnowledgeBaseEntry, Observation
from app.schemas import (
    AIInterpretRequest,
    AIProposeRequest,
    AIResultEnvelope,
    KBPatchApproveRequest,
    KBPatchRejectRequest,
    PendingKBRequest,
    PendingKBResponse,
    WeeklyObservationsRequest,
    WeeklyObservationsResponse,
)
from app.services.orchestrator import AssistantOrchestrator

settings = get_settings()
app = FastAPI(title="Smart Planner AI Assistant", version="2.0.0")
orchestrator = AssistantOrchestrator()
logger = logging.getLogger(__name__)


def _map_reason_code(raw: str) -> str:
    lower = (raw or "").lower()
    if "timeout" in lower:
        return "timeout"
    if "429" in lower or "rate_limit" in lower or "rate limit" in lower:
        return "rate_limit"
    if any(marker in lower for marker in ("backend", "database", "db_unavailable")):
        return "backend_unavailable"
    if any(marker in lower for marker in ("provider", "openai", "deepseek", "model")):
        return "provider_error"
    return "unknown"


def _fallback_user_message(*, planner_like: bool, actor_role: str, reason_code: str, reason: str) -> str:
    base = (
        "AI is temporarily unavailable. I can show schedule/free slots and create an event manually."
        if planner_like
        else "AI is temporarily unavailable."
    )
    if actor_role == "admin":
        return f"{base} [reason_code={reason_code}; details={reason[:180]}]"
    return base


async def require_internal_api_key(x_internal_api_key: str | None = Header(default=None)) -> None:
    expected = settings.internal_api_key.strip()
    if not expected:
        return
    if x_internal_api_key != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_internal_api_key")


async def require_admin_role(x_actor_role: str | None = Header(default=None)) -> None:
    if (x_actor_role or "").strip().lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_role_required")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "ai-assistant", "version": "2.0.0"}


@app.post("/v1/ai/interpret", response_model=AIResultEnvelope, dependencies=[Depends(require_internal_api_key)])
async def interpret(payload: AIInterpretRequest) -> AIResultEnvelope:
    try:
        return await orchestrator.interpret(payload)
    except Exception as exc:
        mode = payload.mode
        request_id = str(payload.request_id)
        reason = str(exc)
        reason_code = _map_reason_code(reason)
        planner_like = "PLANNER" == mode or any(
            marker in payload.message.lower()
            for marker in ("распис", "событ", "встреч", "дедлайн", "calendar", "schedule", "event")
        )
        logger.exception(
            "interpret failed",
            extra={"request_id": request_id, "mode": mode, "actor_role": payload.actor_role, "reason_code": reason_code},
        )
        return AIResultEnvelope(
            request_id=request_id,
            mode=mode,
            intent="fallback",
            confidence=0.0,
            reason_code=reason_code,
            requires_user_input=False,
            clarifying_question=None,
            proposed_actions=[],
            options=[],
            planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
            memory_suggestions=[],
            observations_to_log=[],
            user_message=_fallback_user_message(
                planner_like=planner_like,
                actor_role=payload.actor_role,
                reason_code=reason_code,
                reason=reason,
            ),
        )


@app.post("/v1/ai/propose", response_model=AIResultEnvelope, dependencies=[Depends(require_internal_api_key)])
async def propose(payload: AIProposeRequest) -> AIResultEnvelope:
    try:
        return await orchestrator.propose(payload)
    except Exception as exc:
        logger.exception(
            "propose failed",
            extra={"request_id": str(payload.request_id), "mode": payload.interpreted.mode},
        )
        interpreted = payload.interpreted
        envelope = interpreted.model_copy(deep=True)
        envelope.intent = "fallback"
        envelope.reason_code = _map_reason_code(str(exc))
        envelope.requires_user_input = False
        envelope.clarifying_question = None
        envelope.proposed_actions = []
        envelope.options = []
        envelope.planner_summary.warnings.append(str(exc))
        envelope.user_message = "Не удалось подготовить ответ. Попробуй снова чуть позже."
        return envelope


@app.post(
    "/v1/admin/observations/weekly",
    response_model=WeeklyObservationsResponse,
    dependencies=[Depends(require_internal_api_key), Depends(require_admin_role)],
)
async def admin_weekly_observations(
    payload: WeeklyObservationsRequest,
    session: AsyncSession = Depends(get_session),
) -> WeeklyObservationsResponse:
    now = datetime.now(timezone.utc)
    date_to = now.date()
    date_from = (now - timedelta(days=payload.days)).date()
    since = datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)

    stmt = select(Observation).where(Observation.created_at >= since).order_by(desc(Observation.created_at))
    rows = (await session.scalars(stmt)).all()

    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "impact_high": 0, "impact_med": 0, "impact_low": 0, "examples": []}
    )

    for row in rows:
        key = str(row.observation_type)
        bucket = grouped[key]
        bucket["count"] += 1
        impact = str(row.impact)
        if impact == "high":
            bucket["impact_high"] += 1
        elif impact == "med":
            bucket["impact_med"] += 1
        else:
            bucket["impact_low"] += 1

        for item in (row.examples_anonymized or []):
            if len(bucket["examples"]) < 3:
                bucket["examples"].append(item)

    items = [
        {
            "type": obs_type,
            "count": payload_data["count"],
            "impact_high": payload_data["impact_high"],
            "impact_med": payload_data["impact_med"],
            "impact_low": payload_data["impact_low"],
            "examples": payload_data["examples"],
        }
        for obs_type, payload_data in grouped.items()
    ]
    items.sort(key=lambda item: item["count"], reverse=True)

    return WeeklyObservationsResponse(date_from=date_from, date_to=date_to, items=items)


@app.post(
    "/v1/admin/kb/pending",
    response_model=PendingKBResponse,
    dependencies=[Depends(require_internal_api_key), Depends(require_admin_role)],
)
async def admin_pending_kb_changes(
    payload: PendingKBRequest,
    session: AsyncSession = Depends(get_session),
) -> PendingKBResponse:
    stmt = (
        select(AdminKbPatch)
        .where(AdminKbPatch.status == "pending")
        .order_by(desc(AdminKbPatch.created_at))
        .limit(payload.limit)
    )
    rows = (await session.scalars(stmt)).all()
    items = [
        {
            "id": str(row.id),
            "kb_entry_id": str(row.kb_entry_id) if row.kb_entry_id else None,
            "proposed_by_user_id": str(row.proposed_by_user_id) if row.proposed_by_user_id else None,
            "status": row.status,
            "patch_payload": row.patch_payload,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
    return PendingKBResponse(items=items)


async def _apply_kb_patch(session: AsyncSession, patch: AdminKbPatch) -> KnowledgeBaseEntry:
    payload = patch.patch_payload or {}
    slug = str(payload.get("slug") or "").strip()
    title = str(payload.get("title") or "").strip()
    content = str(payload.get("content") or "").strip()
    tags = payload.get("tags") or []

    if patch.kb_entry_id:
        entry = await session.get(KnowledgeBaseEntry, patch.kb_entry_id)
    else:
        entry = None

    if entry is None and slug:
        stmt = select(KnowledgeBaseEntry).where(KnowledgeBaseEntry.slug == slug)
        entry = await session.scalar(stmt)

    if entry is None:
        entry = KnowledgeBaseEntry(
            id=uuid4(),
            slug=slug or f"kb-{uuid4().hex[:10]}",
            title=title or "Untitled",
            content=content or "",
            status="approved",
            version=1,
            tags=tags,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(entry)
    else:
        if slug:
            entry.slug = slug
        if title:
            entry.title = title
        if content:
            entry.content = content
        entry.tags = tags if isinstance(tags, list) else entry.tags
        entry.status = "approved"
        entry.version = max(1, int(entry.version or 1) + 1)
        entry.updated_at = datetime.now(timezone.utc)

    await session.flush()
    return entry


@app.post(
    "/v1/admin/kb/approve",
    dependencies=[Depends(require_internal_api_key), Depends(require_admin_role)],
)
async def admin_approve_kb_patch(
    payload: KBPatchApproveRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    patch = await session.get(AdminKbPatch, payload.patch_id)
    if patch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="patch_not_found")

    if patch.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="patch_not_pending")

    entry = await _apply_kb_patch(session, patch)

    patch.kb_entry_id = entry.id
    patch.status = "approved"
    patch.reviewed_by_user_id = payload.reviewer_user_id
    patch.reviewed_at = datetime.now(timezone.utc)
    patch.rejection_reason = None
    patch.updated_at = datetime.now(timezone.utc)

    await session.commit()
    return {
        "status": "approved",
        "patch_id": str(patch.id),
        "kb_entry_id": str(entry.id),
        "kb_entry_version": entry.version,
    }


@app.post(
    "/v1/admin/kb/reject",
    dependencies=[Depends(require_internal_api_key), Depends(require_admin_role)],
)
async def admin_reject_kb_patch(
    payload: KBPatchRejectRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    patch = await session.get(AdminKbPatch, payload.patch_id)
    if patch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="patch_not_found")

    if patch.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="patch_not_pending")

    patch.status = "rejected"
    patch.reviewed_by_user_id = payload.reviewer_user_id
    patch.reviewed_at = datetime.now(timezone.utc)
    patch.rejection_reason = payload.reason
    patch.updated_at = datetime.now(timezone.utc)

    await session.commit()
    return {
        "status": "rejected",
        "patch_id": str(patch.id),
        "reason": payload.reason,
    }




