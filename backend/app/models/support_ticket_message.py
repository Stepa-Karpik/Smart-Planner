from __future__ import annotations

from uuid import UUID as UUIDType

from sqlalchemy import ForeignKey, Index, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SupportTicketMessage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "support_ticket_messages"
    __table_args__ = (
        Index("ix_support_ticket_messages_ticket_id", "ticket_id"),
        Index("ix_support_ticket_messages_author_role", "author_role"),
    )

    ticket_id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id"), nullable=False)
    author_user_id: Mapped[UUIDType | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    author_role: Mapped[str] = mapped_column(String(16), nullable=False)  # user/admin/system
    body: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    ticket = relationship("SupportTicket", back_populates="messages")
    author_user = relationship("User", back_populates="support_ticket_messages_authored")

