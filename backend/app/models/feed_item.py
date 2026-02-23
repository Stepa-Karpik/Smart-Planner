from __future__ import annotations

from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class FeedItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "feed_items"
    __table_args__ = (
        Index("ix_feed_items_created_at", "created_at"),
        Index("ix_feed_items_type", "type"),
        Index("ix_feed_items_target_username", "target_username"),
    )

    type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(String(4000), nullable=False)
    target_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[UUIDType | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Optional backdating / manual scheduling for admin-managed announcements.
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    created_by = relationship("User", back_populates="feed_items_created")
