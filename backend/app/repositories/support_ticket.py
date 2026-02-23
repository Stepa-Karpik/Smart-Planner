from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import SupportTicketStatus
from app.models import SupportTicket, SupportTicketMessage


class SupportTicketRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_ticket_by_id(self, ticket_id: UUID, *, with_messages: bool = False) -> SupportTicket | None:
        stmt = select(SupportTicket).where(SupportTicket.id == ticket_id)
        if with_messages:
            stmt = stmt.options(selectinload(SupportTicket.messages))
        return await self.session.scalar(stmt)

    async def get_ticket_for_user(self, ticket_id: UUID, user_id: UUID, *, with_messages: bool = False) -> SupportTicket | None:
        stmt = select(SupportTicket).where(and_(SupportTicket.id == ticket_id, SupportTicket.user_id == user_id))
        if with_messages:
            stmt = stmt.options(selectinload(SupportTicket.messages))
        return await self.session.scalar(stmt)

    async def list_tickets_for_user(self, *, user_id: UUID, limit: int = 100, offset: int = 0) -> list[SupportTicket]:
        stmt = (
            select(SupportTicket)
            .where(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.updated_at.desc(), SupportTicket.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def list_tickets_all(
        self,
        *,
        q: str | None = None,
        status: SupportTicketStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SupportTicket]:
        stmt = select(SupportTicket).order_by(SupportTicket.updated_at.desc(), SupportTicket.created_at.desc()).limit(limit).offset(offset)
        if q:
            pattern = f"%{q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(SupportTicket.subject).like(pattern), func.lower(SupportTicket.topic).like(pattern), func.lower(SupportTicket.subtopic).like(pattern)))
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def count_tickets_all(self, *, q: str | None = None, status: SupportTicketStatus | None = None) -> int:
        stmt = select(func.count()).select_from(SupportTicket)
        conditions = []
        if q:
            pattern = f"%{q.strip().lower()}%"
            conditions.append(or_(func.lower(SupportTicket.subject).like(pattern), func.lower(SupportTicket.topic).like(pattern), func.lower(SupportTicket.subtopic).like(pattern)))
        if status:
            conditions.append(SupportTicket.status == status)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        value = await self.session.scalar(stmt)
        return int(value or 0)

    async def _next_public_number(self) -> int:
        value = await self.session.scalar(select(func.max(SupportTicket.public_number)))
        return int(value or 0) + 1

    async def create_ticket(
        self,
        *,
        user_id: UUID,
        topic: str,
        subtopic: str,
        subject: str,
        initial_message: str,
        attachments: list[dict] | None = None,
    ) -> tuple[SupportTicket, SupportTicketMessage]:
        ticket = SupportTicket(
            public_number=await self._next_public_number(),
            user_id=user_id,
            topic=topic.strip(),
            subtopic=subtopic.strip(),
            subject=subject.strip(),
            status=SupportTicketStatus.OPEN,
        )
        self.session.add(ticket)
        await self.session.flush()
        message = SupportTicketMessage(
            ticket_id=ticket.id,
            author_user_id=user_id,
            author_role="user",
            body=initial_message.strip(),
            attachments_json=attachments or None,
        )
        self.session.add(message)
        await self.session.flush()
        return ticket, message

    async def add_message(
        self,
        ticket: SupportTicket,
        *,
        author_user_id: UUID | None,
        author_role: str,
        body: str,
        attachments: list[dict] | None = None,
    ) -> SupportTicketMessage:
        message = SupportTicketMessage(
            ticket_id=ticket.id,
            author_user_id=author_user_id,
            author_role=author_role,
            body=body.strip(),
            attachments_json=attachments or None,
        )
        self.session.add(message)
        if author_role == "admin":
            ticket.status = SupportTicketStatus.ANSWERED
            ticket.closed_at = None
        elif author_role == "user":
            ticket.status = SupportTicketStatus.OPEN
            ticket.closed_at = None
        ticket.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return message

    async def close_ticket(self, ticket: SupportTicket) -> SupportTicket:
        ticket.status = SupportTicketStatus.CLOSED
        ticket.closed_at = datetime.now(timezone.utc)
        ticket.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return ticket
