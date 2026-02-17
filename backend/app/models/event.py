from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EventLocationSource, EventStatus
from app.db.base import Base
from app.db.types import db_enum
from app.models.mixins import TimestampMixin


class Event(Base, TimestampMixin):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_events_end_after_start"),
        Index("ix_events_calendar_start", "calendar_id", "start_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("calendars.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_lat: Mapped[float | None] = mapped_column(nullable=True)
    location_lon: Mapped[float | None] = mapped_column(nullable=True)
    location_source: Mapped[EventLocationSource] = mapped_column(
        db_enum(EventLocationSource, "event_location_source"),
        default=EventLocationSource.MANUAL_TEXT,
        nullable=False,
    )

    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    all_day: Mapped[bool] = mapped_column(default=False, nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        db_enum(EventStatus, "event_status"),
        default=EventStatus.PLANNED,
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    calendar = relationship("Calendar", back_populates="events")
    reminders = relationship("Reminder", back_populates="event", cascade="all,delete-orphan")
