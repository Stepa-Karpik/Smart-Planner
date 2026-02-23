from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EventLocationSource, MapProvider, RouteMode, UserRole
from app.db.base import Base
from app.db.types import db_enum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        db_enum(UserRole, "user_role"),
        default=UserRole.USER,
        nullable=False,
        server_default=UserRole.USER.value,
    )
    default_route_mode: Mapped[RouteMode] = mapped_column(
        db_enum(RouteMode, "route_mode"),
        default=RouteMode.PUBLIC_TRANSPORT,
        nullable=False,
    )
    map_provider: Mapped[MapProvider] = mapped_column(
        db_enum(MapProvider, "map_provider"),
        default=MapProvider.LEAFLET,
        nullable=False,
    )
    home_location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    home_location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_location_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_location_source: Mapped[EventLocationSource | None] = mapped_column(
        db_enum(EventLocationSource, "event_location_source"),
        nullable=True,
    )
    twofa_method: Mapped[str] = mapped_column(String(16), nullable=False, default="none", server_default="none")
    twofa_totp_secret: Mapped[str | None] = mapped_column(String(128), nullable=True)
    twofa_totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    twofa_telegram_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    twofa_last_totp_step: Mapped[int | None] = mapped_column(Integer, nullable=True)

    calendars = relationship("Calendar", back_populates="user", cascade="all,delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all,delete-orphan")
    telegram_link = relationship("TelegramLink", back_populates="user", uselist=False, cascade="all,delete-orphan")
    telegram_start_codes = relationship("TelegramStartCode", back_populates="user", cascade="all,delete-orphan")
    ai_sessions = relationship("AISession", back_populates="user", cascade="all,delete-orphan")
    ai_jobs = relationship("AITaskIngestionJob", back_populates="user", cascade="all,delete-orphan")
    profile_memory = relationship("UserProfileMemory", back_populates="user", uselist=False, cascade="all,delete-orphan")
    conversation_summaries = relationship("ConversationSummary", back_populates="user", cascade="all,delete-orphan")
    semantic_memory_items = relationship("SemanticMemoryItem", back_populates="user", cascade="all,delete-orphan")
    observations = relationship("Observation", back_populates="user")
    kb_patches_proposed = relationship("AdminKbPatch", foreign_keys="AdminKbPatch.proposed_by_user_id", back_populates="proposed_by")
    kb_patches_reviewed = relationship("AdminKbPatch", foreign_keys="AdminKbPatch.reviewed_by_user_id", back_populates="reviewed_by")
    feed_items_created = relationship("FeedItem", back_populates="created_by")
