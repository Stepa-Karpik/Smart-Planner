from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AITaskStatus
from app.models import AIMessage, AISession, AITaskIngestionJob


class AIRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_session(self, user_id: UUID) -> AISession:
        item = AISession(user_id=user_id)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_session(self, user_id: UUID, session_id: UUID) -> AISession | None:
        stmt = select(AISession).where(AISession.user_id == user_id, AISession.id == session_id)
        return await self.session.scalar(stmt)

    async def list_sessions(self, user_id: UUID) -> Sequence[AISession]:
        stmt = select(AISession).where(AISession.user_id == user_id).order_by(AISession.last_used_at.desc())
        result = await self.session.scalars(stmt)
        return result.all()

    async def list_messages(self, user_id: UUID, session_id: UUID) -> Sequence[AIMessage]:
        stmt = (
            select(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(AISession.user_id == user_id, AISession.id == session_id)
            .order_by(AIMessage.created_at.asc())
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def list_recent_messages(self, user_id: UUID, session_id: UUID, limit: int = 16) -> Sequence[AIMessage]:
        stmt = (
            select(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(AISession.user_id == user_id, AISession.id == session_id)
            .order_by(AIMessage.created_at.desc())
            .limit(limit)
        )
        result = await self.session.scalars(stmt)
        return list(reversed(result.all()))

    async def touch_session(self, session_id: UUID) -> None:
        item = await self.session.get(AISession, session_id)
        if item is not None:
            item.last_used_at = datetime.now(timezone.utc)
            await self.session.flush()

    async def create_message(
        self,
        session_id: UUID,
        role: str,
        content: str,
        provider: str,
        model: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
    ) -> AIMessage:
        item = AIMessage(
            session_id=session_id,
            role=role,
            content=content,
            provider=provider,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        self.session.add(item)
        await self.session.flush()
        await self.touch_session(session_id)
        return item

    async def create_job(self, user_id: UUID, source: str, payload_ref: str) -> AITaskIngestionJob:
        item = AITaskIngestionJob(user_id=user_id, source=source, payload_ref=payload_ref)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_job(self, job_id: UUID) -> AITaskIngestionJob | None:
        stmt = select(AITaskIngestionJob).where(AITaskIngestionJob.id == job_id)
        return await self.session.scalar(stmt)

    async def set_job_status(
        self,
        job: AITaskIngestionJob,
        status: AITaskStatus,
        result_payload: dict | None = None,
        error: str | None = None,
    ) -> None:
        job.status = status
        job.result_payload = result_payload
        job.error = error
        await self.session.flush()
