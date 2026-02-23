from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SupportTicketStatus
from app.db.base import Base
from app.db.types import db_enum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SupportTicket(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_user_id", "user_id"),
        Index("ix_support_tickets_status", "status"),
        Index("ix_support_tickets_public_number", "public_number", unique=True),
    )

    public_number: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    user_id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    topic: Mapped[str] = mapped_column(String(80), nullable=False)
    subtopic: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[SupportTicketStatus] = mapped_column(
        db_enum(SupportTicketStatus, "support_ticket_status"),
        nullable=False,
        default=SupportTicketStatus.OPEN,
        server_default=SupportTicketStatus.OPEN.value,
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="support_tickets")
    messages = relationship("SupportTicketMessage", back_populates="ticket", cascade="all,delete-orphan", order_by="SupportTicketMessage.created_at")

