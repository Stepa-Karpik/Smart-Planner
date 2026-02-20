from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AIChatType, AIRole, AITaskStatus
from app.models import AIMessage, AISession, AITaskIngestionJob


class AIRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _next_display_index(self, user_id: UUID) -> int:
        stmt = select(func.coalesce(func.max(AISession.display_index), 0)).where(AISession.user_id == user_id)
        current_max = await self.session.scalar(stmt)
        return int(current_max or 0) + 1

    async def create_session(self, user_id: UUID, chat_type: AIChatType) -> AISession:
        next_index = await self._next_display_index(user_id)
        item = AISession(user_id=user_id, chat_type=chat_type, display_index=next_index, is_deleted=False)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_session(self, user_id: UUID, session_id: UUID, *, include_deleted: bool = False) -> AISession | None:
        stmt = select(AISession).where(AISession.user_id == user_id, AISession.id == session_id)
        if not include_deleted:
            stmt = stmt.where(AISession.is_deleted.is_(False))
        return await self.session.scalar(stmt)

    async def get_latest_session_by_type(self, user_id: UUID, chat_type: AIChatType) -> AISession | None:
        stmt = (
            select(AISession)
            .where(
                AISession.user_id == user_id,
                AISession.chat_type == chat_type,
                AISession.is_deleted.is_(False),
            )
            .order_by(AISession.last_used_at.desc(), AISession.created_at.desc())
            .limit(1)
        )
        return await self.session.scalar(stmt)

    async def list_sessions(self, user_id: UUID) -> Sequence[AISession]:
        stmt = (
            select(AISession)
            .where(AISession.user_id == user_id, AISession.is_deleted.is_(False))
            .order_by(AISession.last_used_at.desc(), AISession.created_at.desc())
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def list_messages(self, user_id: UUID, session_id: UUID) -> Sequence[AIMessage]:
        stmt = (
            select(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(
                AISession.user_id == user_id,
                AISession.id == session_id,
                AISession.is_deleted.is_(False),
            )
            .order_by(AIMessage.created_at.asc())
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def list_recent_messages(self, user_id: UUID, session_id: UUID, limit: int = 16) -> Sequence[AIMessage]:
        stmt = (
            select(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(
                AISession.user_id == user_id,
                AISession.id == session_id,
                AISession.is_deleted.is_(False),
            )
            .order_by(AIMessage.created_at.desc())
            .limit(limit)
        )
        result = await self.session.scalars(stmt)
        return list(reversed(result.all()))

    async def count_messages(self, user_id: UUID, session_id: UUID) -> int:
        stmt = (
            select(func.count(AIMessage.id))
            .select_from(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(
                AISession.user_id == user_id,
                AISession.id == session_id,
                AISession.is_deleted.is_(False),
            )
        )
        value = await self.session.scalar(stmt)
        return int(value or 0)

    async def is_session_empty(self, user_id: UUID, session_id: UUID) -> bool:
        return (await self.count_messages(user_id, session_id)) == 0

    async def update_session_chat_type(self, session_obj: AISession, chat_type: AIChatType) -> AISession:
        session_obj.chat_type = chat_type
        await self.session.flush()
        return session_obj

    async def soft_delete_session(self, user_id: UUID, session_id: UUID) -> AISession | None:
        item = await self.get_session(user_id, session_id)
        if item is None:
            return None
        item.is_deleted = True
        await self.session.flush()
        return item

    async def touch_session(self, session_id: UUID) -> None:
        item = await self.session.get(AISession, session_id)
        if item is not None and not item.is_deleted:
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

    async def get_first_user_message(self, user_id: UUID, session_id: UUID) -> AIMessage | None:
        stmt = (
            select(AIMessage)
            .join(AISession, AISession.id == AIMessage.session_id)
            .where(
                AISession.user_id == user_id,
                AISession.id == session_id,
                AISession.is_deleted.is_(False),
                AIMessage.role == AIRole.USER,
            )
            .order_by(AIMessage.created_at.asc())
            .limit(1)
        )
        return await self.session.scalar(stmt)

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
