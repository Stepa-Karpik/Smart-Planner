from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AssistantMode,
    ImpactLevel,
    KBPatchStatus,
    KnowledgeStatus,
    MemoryItemType,
    MemorySource,
    ObservationType,
)
from app.db.base import Base
from app.db.types import db_enum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UserProfileMemory(Base, TimestampMixin):
    __tablename__ = "user_profile_memory"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    default_mode: Mapped[AssistantMode] = mapped_column(
        db_enum(AssistantMode, "assistant_mode"),
        default=AssistantMode.AUTO,
        nullable=False,
    )
    proactivity_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    preferences: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    routines: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    places: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    style_signals: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    user = relationship("User", back_populates="profile_memory")


class ConversationSummary(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "conversation_summaries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token_estimate: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="conversation_summaries")


class SemanticMemoryItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "semantic_memory_items"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    item_type: Mapped[MemoryItemType] = mapped_column(db_enum(MemoryItemType, "memory_item_type"), nullable=False)
    key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    source: Mapped[MemorySource] = mapped_column(db_enum(MemorySource, "memory_source"), nullable=False)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prompt_user: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="semantic_memory_items")


class KnowledgeBaseEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "knowledge_base_entries"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[KnowledgeStatus] = mapped_column(
        db_enum(KnowledgeStatus, "knowledge_status"),
        default=KnowledgeStatus.DRAFT,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    tags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    patches = relationship("AdminKbPatch", back_populates="kb_entry")


class Observation(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "observations"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    observation_type: Mapped[ObservationType] = mapped_column(
        db_enum(ObservationType, "observation_type"),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    examples_anonymized: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    impact: Mapped[ImpactLevel] = mapped_column(db_enum(ImpactLevel, "impact_level"), default=ImpactLevel.LOW, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="observations")


class AdminKbPatch(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "admin_kb_patches"

    kb_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_base_entries.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    proposed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[KBPatchStatus] = mapped_column(
        db_enum(KBPatchStatus, "kb_patch_status"),
        default=KBPatchStatus.PENDING,
        nullable=False,
    )
    patch_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    kb_entry = relationship("KnowledgeBaseEntry", back_populates="patches")
    proposed_by = relationship("User", foreign_keys=[proposed_by_user_id], back_populates="kb_patches_proposed")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id], back_populates="kb_patches_reviewed")
