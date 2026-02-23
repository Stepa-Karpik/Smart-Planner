from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.enums import SupportTicketStatus
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.responses import success_response
from app.repositories.support_ticket import SupportTicketRepository
from app.services.support import MAX_TICKET_ATTACHMENTS, persist_ticket_attachments, publish_ticket_feed_event, resolve_support_attachment_path

router = APIRouter(prefix="/support", tags=["Support"])


def _serialize_attachment(item: dict) -> dict:
    return {
        "original_name": item.get("original_name") or "",
        "stored_name": item.get("stored_name") or "",
        "content_type": item.get("content_type") or "application/octet-stream",
        "size_bytes": int(item.get("size_bytes") or 0),
    }


def _serialize_message(message) -> dict:
    attachments = [_serialize_attachment(item) for item in (message.attachments_json or []) if isinstance(item, dict)]
    return {
        "id": str(message.id),
        "ticket_id": str(message.ticket_id),
        "author_user_id": str(message.author_user_id) if message.author_user_id else None,
        "author_role": message.author_role,
        "body": message.body,
        "attachments": attachments,
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


@router.get("/tickets")
async def list_my_support_tickets(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    repo = SupportTicketRepository(session)
    tickets = await repo.list_tickets_for_user(user_id=current_user.id, limit=limit, offset=offset)
    data = [_serialize_ticket(ticket, include_messages=False) for ticket in tickets]
    return success_response(data=data, request=request)


@router.get("/tickets/{ticket_id}")
async def get_my_support_ticket(
    ticket_id: UUID,
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_for_user(ticket_id, current_user.id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.post("/tickets")
async def create_support_ticket(
    request: Request,
    topic: str = Form(...),
    subtopic: str = Form(...),
    subject: str = Form(...),
    message: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    topic = topic.strip()
    subtopic = subtopic.strip()
    subject = subject.strip()
    message = message.strip()

    if not topic or not subtopic or not subject or not message:
        raise ValidationAppError("Topic, subtopic, subject, and message are required")
    if len(files) > MAX_TICKET_ATTACHMENTS:
        raise ValidationAppError("You can attach up to 3 files", details={"max_files": MAX_TICKET_ATTACHMENTS})

    repo = SupportTicketRepository(session)
    ticket, initial_message = await repo.create_ticket(
        user_id=current_user.id,
        topic=topic,
        subtopic=subtopic,
        subject=subject,
        initial_message=message,
        attachments=None,
    )

    if files:
        try:
            attachments = await persist_ticket_attachments(files, ticket_id=str(ticket.id), message_id=str(initial_message.id))
        except ValueError as exc:
            raise ValidationAppError(str(exc))
        initial_message.attachments_json = attachments
        await session.flush()

    await publish_ticket_feed_event(
        session,
        user=current_user,
        ticket_id=str(ticket.id),
        ticket_number=ticket.public_number,
        topic=ticket.topic,
        subtopic=ticket.subtopic,
        event_kind="created",
        body=message,
        created_by_user_id=current_user.id,
    )

    await session.commit()

    ticket = await repo.get_ticket_for_user(ticket.id, current_user.id, with_messages=True)
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.post("/tickets/{ticket_id}/reply")
async def reply_my_support_ticket(
    ticket_id: UUID,
    request: Request,
    message: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    message = message.strip()
    if not message:
        raise ValidationAppError("Message is required")
    if len(files) > MAX_TICKET_ATTACHMENTS:
        raise ValidationAppError("You can attach up to 3 files", details={"max_files": MAX_TICKET_ATTACHMENTS})

    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_for_user(ticket_id, current_user.id, with_messages=True)
    if ticket is None:
        raise NotFoundError("Support ticket not found")
    if ticket.status == SupportTicketStatus.CLOSED:
        raise ValidationAppError("Ticket is closed")

    reply = await repo.add_message(ticket, author_user_id=current_user.id, author_role="user", body=message, attachments=None)

    if files:
        try:
            attachments = await persist_ticket_attachments(files, ticket_id=str(ticket.id), message_id=str(reply.id))
        except ValueError as exc:
            raise ValidationAppError(str(exc))
        reply.attachments_json = attachments
        await session.flush()

    await session.commit()
    ticket = await repo.get_ticket_for_user(ticket_id, current_user.id, with_messages=True)
    return success_response(data=_serialize_ticket(ticket, include_messages=True), request=request)


@router.get("/tickets/{ticket_id}/messages/{message_id}/attachments/{stored_name}")
async def get_my_support_ticket_attachment(
    ticket_id: UUID,
    message_id: UUID,
    stored_name: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SupportTicketRepository(session)
    ticket = await repo.get_ticket_for_user(ticket_id, current_user.id, with_messages=True)
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
