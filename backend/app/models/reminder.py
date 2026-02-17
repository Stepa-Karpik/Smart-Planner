from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ReminderStatus, ReminderType
from app.db.base import Base
from app.db.types import db_enum
from app.models.mixins import TimestampMixin


class Reminder(Base, TimestampMixin):
    __tablename__ = "reminders"
    __table_args__ = (Index("ix_reminders_scheduled_status", "scheduled_at", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True, nullable=False)

    type: Mapped[ReminderType] = mapped_column(
        db_enum(ReminderType, "reminder_type"),
        default=ReminderType.TELEGRAM,
        nullable=False,
    )
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[ReminderStatus] = mapped_column(
        db_enum(ReminderStatus, "reminder_status"),
        default=ReminderStatus.SCHEDULED,
        nullable=False,
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    event = relationship("Event", back_populates="reminders")
