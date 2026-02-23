from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Iterable

from fastapi import UploadFile

from app.models import User
from app.repositories.feed_item import FeedItemRepository

SUPPORT_STORAGE_ROOT = Path("storage/support")
MAX_TICKET_ATTACHMENTS = 3
MAX_TICKET_ATTACHMENT_BYTES = 3 * 1024 * 1024


def sanitize_filename(filename: str | None) -> str:
    raw = (filename or "attachment").strip()
    raw = raw.replace("\\", "/").split("/")[-1]
    raw = re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("._")
    return raw or "attachment"


async def persist_ticket_attachments(
    files: Iterable[UploadFile],
    *,
    ticket_id: str,
    message_id: str,
) -> list[dict]:
    target_dir = SUPPORT_STORAGE_ROOT / ticket_id / message_id
    target_dir.mkdir(parents=True, exist_ok=True)

    items: list[dict] = []
    for file in files:
        content = await file.read()
        size_bytes = len(content)
        if size_bytes > MAX_TICKET_ATTACHMENT_BYTES:
            raise ValueError("Attachment exceeds 3 MB limit")
        original_name = sanitize_filename(file.filename)
        suffix = "".join(Path(original_name).suffixes)[:20]
        stored_name = f"{secrets.token_hex(8)}{suffix}"
        stored_path = target_dir / stored_name
        stored_path.write_bytes(content)
        items.append(
            {
                "original_name": original_name,
                "stored_name": stored_name,
                "content_type": file.content_type or "application/octet-stream",
                "size_bytes": size_bytes,
                "path": str(stored_path.as_posix()),
            }
        )
    return items


async def publish_ticket_feed_event(
    session,
    *,
    user: User,
    ticket_id: str,
    ticket_number: int,
    topic: str,
    subtopic: str,
    event_kind: str,
    body: str,
    created_by_user_id,
) -> None:
    title_map = {
        "created": f"Ticket {ticket_number} updated",
        "replied": f"Ticket {ticket_number} updated",
        "closed": f"Ticket {ticket_number} updated",
    }
    body_map = {
        "created": "Ticket created and accepted by support",
        "replied": "Support replied to your ticket",
        "closed": "Ticket was closed by support",
    }
    repo = FeedItemRepository(session)
    await repo.create(
        type="ticket",
        title=title_map.get(event_kind, f"Ticket #{ticket_number}"),
        body=body_map.get(event_kind, body.strip() or "Ticket status updated"),
        meta_json={
            "ticket_event_kind": event_kind,
            "ticket_id": ticket_id,
            "ticket_public_number": ticket_number,
            "ticket_topic": topic,
            "ticket_subtopic": subtopic,
        },
        target_username=(user.username or "").strip().lower(),
        created_by_user_id=created_by_user_id,
    )


def resolve_support_attachment_path(*, ticket_id: str, message_id: str, attachment: dict) -> Path:
    raw_path = str(attachment.get("path") or "").strip()
    if not raw_path:
        raise FileNotFoundError("Attachment path is missing")
    path = Path(raw_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    else:
        path = path.resolve()

    root = (Path.cwd() / SUPPORT_STORAGE_ROOT).resolve()
    expected_parent = (root / ticket_id / message_id).resolve()
    if expected_parent not in path.parents:
        raise FileNotFoundError("Attachment path is outside support storage")
    if not path.is_file():
        raise FileNotFoundError("Attachment file not found")
    return path
