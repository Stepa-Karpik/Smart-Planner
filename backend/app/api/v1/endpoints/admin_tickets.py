from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_user, get_db_session
from app.core.enums import SupportTicketStatus
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.responses import success_response
from app.repositories.support_ticket import SupportTicketRepository
from app.schemas.support import AdminSupportTicketReplyCreate
from app.services.support import publish_ticket_feed_event, resolve_support_attachment_path

router = APIRouter(prefix="/admin/tickets", tags=["Admin Tickets"])


def _serialize_attachment(item: dict) -> dict:
    return {
        "original_name": item.get("original_name") or "",
        "stored_name": item.get("stored_name") or "",
        "content_type": item.get("content_type") or "application/octet-stream",
        "size_bytes": int(item.get("size_bytes") or 0),
    }


def _serialize_message(message) -> dict:
    return {
        "id": str(message.id),
        "ticket_id": str(message.ticket_id),
        "author_user_id": str(message.author_user_id) if message.author_user_id else None,
        "author_role": message.author_role,
        "body": message.body,
        "attachments": [_serialize_attachment(item) for item in (message.attachments_json or []) if isinstance(item, dict)],
        "created_at": message.created_at,
        "updated_at": message.updated_at,
    }


def _serialize_ticket(ticket, include_messages: bool = False) -> dict:
    payload = {
        "id": str(ticket.id),
        "public_number": int(ticket.public_number),
        "user_id": str(ticket.user_id),
        "topic": ticket.topic,
        "subtopic": ticket.subtopic,
        "subject": ticket.subject,
        "status": ticket.status,
        "closed_at": ticket.closed_at,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }
    if include_messages:
        payload["messages"] = [_serialize_message(item) for item in ticket.messages]
    return payload


@router.get("")
async def admin_list_support_tickets(
    request: Request,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
    q: str | None = Query(default=None),
    status: SupportTicketStatus | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    repo = SupportTicketRepository(session)
    items = await repo.list_tickets_all(q=q, status=status, limit=limit, offset=offset)
    total = await repo.count_tickets_all(q=q, status=status)
    data = [_serialize_ticket(item) for item in items]
    return success_response(data=data, request=request, pagination={"total": total, "limit": limit, "offset": offset})


@router.get("/{ticket_id}")
async def admin_get_support_ticket(
    ticket_id: UUID,
    request: Request,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.post("/{ticket_id}/reply")
async def admin_reply_support_ticket(
    ticket_id: UUID,
    payload: AdminSupportTicketReplyCreate,
    request: Request,
    admin_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")
    if ticket.status == SupportTicketStatus.CLOSED:
        raise ValidationAppError("Ticket is closed")

    message = await repo.add_message(ticket, author_user_id=admin_user.id, author_role="admin", body=payload.message)

    # ticket.user may not be loaded; resolve from relationship if present via ticket.user_id and admin session.
    user = ticket.user
    if user is None:
        # lazy load through scalar refresh
        await session.refresh(ticket, attribute_names=["user"])
        user = ticket.user
    if user is not None:
        await publish_ticket_feed_event(
            session,
            user=user,
            ticket_id=str(ticket.id),
            ticket_number=ticket.public_number,
            topic=ticket.topic,
            subtopic=ticket.subtopic,
            event_kind="replied",
            body=payload.message,
            created_by_user_id=admin_user.id,
        )

    await session.commit()
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.post("/{ticket_id}/close")
async def admin_close_support_ticket(
    ticket_id: UUID,
    request: Request,
    admin_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")
    if ticket.status == SupportTicketStatus.CLOSED:
        return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)

    await repo.close_ticket(ticket)
    await repo.add_message(ticket, author_user_id=admin_user.id, author_role="system", body="Ticket closed by administrator")

    user = ticket.user
    if user is None:
        await session.refresh(ticket, attribute_names=["user"])
        user = ticket.user
    if user is not None:
        await publish_ticket_feed_event(
            session,
            user=user,
            ticket_id=str(ticket.id),
            ticket_number=ticket.public_number,
            topic=ticket.topic,
            subtopic=ticket.subtopic,
            event_kind="closed",
            body="Ticket closed by administrator",
            created_by_user_id=admin_user.id,
        )

    await session.commit()
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.get("/{ticket_id}/messages/{message_id}/attachments/{stored_name}")
async def admin_get_support_ticket_attachment(
    ticket_id: UUID,
    message_id: UUID,
    stored_name: str,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_by_id(ticket_id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")

    message = next((item for item in ticket.messages if item.id == message_id), None)
    if message is None:
        raise NotFoundError("Support ticket message not found")

    attachment = next((item for item in (message.attachments_json or []) if isinstance(item, dict) and item.get("stored_name") == stored_name), None)
    if attachment is None:
        raise NotFoundError("Attachment not found")

    try:
        file_path = resolve_support_attachment_path(ticket_id=str(ticket.id), message_id=str(message.id), attachment=attachment)
    except FileNotFoundError as exc:
        raise NotFoundError(str(exc))

    return FileResponse(
        path=file_path,
        media_type=str(attachment.get("content_type") or "application/octet-stream"),
        filename=str(attachment.get("original_name") or stored_name),
    )
