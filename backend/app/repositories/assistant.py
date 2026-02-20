from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AssistantMode,
    ImpactLevel,
    KBPatchStatus,
    KnowledgeStatus,
    MemoryItemType,
    MemorySource,
    ObservationType,
)
from app.models import AdminKbPatch, ConversationSummary, KnowledgeBaseEntry, Observation, SemanticMemoryItem, UserProfileMemory


class AssistantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile_memory(self, user_id: UUID) -> UserProfileMemory | None:
        stmt = select(UserProfileMemory).where(UserProfileMemory.user_id == user_id)
        return await self.session.scalar(stmt)

    async def get_or_create_profile_memory(self, user_id: UUID) -> UserProfileMemory:
        item = await self.get_profile_memory(user_id)
        if item is not None:
            return item

        item = UserProfileMemory(user_id=user_id)
        self.session.add(item)
        await self.session.flush()
        return item

    async def set_default_mode(self, user_id: UUID, mode: AssistantMode) -> UserProfileMemory:
        profile = await self.get_or_create_profile_memory(user_id)
        profile.default_mode = mode
        await self.session.flush()
        return profile

    async def set_preference(self, user_id: UUID, key: str, value) -> UserProfileMemory:
        profile = await self.get_or_create_profile_memory(user_id)
        payload = dict(profile.preferences or {})
        payload[key] = value
        profile.preferences = payload
        await self.session.flush()
        return profile

    async def set_style_signal(self, user_id: UUID, key: str, value) -> UserProfileMemory:
        profile = await self.get_or_create_profile_memory(user_id)
        payload = dict(profile.style_signals or {})
        payload[key] = value
        profile.style_signals = payload
        await self.session.flush()
        return profile

    async def get_conversation_summary(self, user_id: UUID, session_id: UUID) -> ConversationSummary | None:
        stmt = select(ConversationSummary).where(
            ConversationSummary.user_id == user_id,
            ConversationSummary.session_id == session_id,
        )
        return await self.session.scalar(stmt)

    async def upsert_conversation_summary(
        self,
        user_id: UUID,
        session_id: UUID,
        summary: str,
        message_count: int,
        token_estimate: int,
    ) -> ConversationSummary:
        item = await self.get_conversation_summary(user_id, session_id)
        if item is None:
            item = ConversationSummary(
                user_id=user_id,
                session_id=session_id,
                summary=summary,
                message_count=message_count,
                token_estimate=token_estimate,
            )
            self.session.add(item)
        else:
            item.summary = summary
            item.message_count = message_count
            item.token_estimate = token_estimate
        await self.session.flush()
        return item

    async def list_semantic_memory_items(
        self,
        user_id: UUID,
        *,
        include_unconfirmed: bool = False,
        limit: int = 20,
    ) -> list[SemanticMemoryItem]:
        stmt: Select[tuple[SemanticMemoryItem]] = (
            select(SemanticMemoryItem)
            .where(SemanticMemoryItem.user_id == user_id)
            .order_by(desc(SemanticMemoryItem.confidence), desc(SemanticMemoryItem.updated_at))
            .limit(limit)
        )
        if not include_unconfirmed:
            stmt = stmt.where(SemanticMemoryItem.is_confirmed.is_(True))

        result = await self.session.scalars(stmt)
        return result.all()

    async def list_pending_memory_items(self, user_id: UUID, limit: int = 20) -> list[SemanticMemoryItem]:
        stmt = (
            select(SemanticMemoryItem)
            .where(
                SemanticMemoryItem.user_id == user_id,
                SemanticMemoryItem.requires_confirmation.is_(True),
                SemanticMemoryItem.is_confirmed.is_(False),
            )
            .order_by(desc(SemanticMemoryItem.updated_at))
            .limit(limit)
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def create_semantic_memory_item(
        self,
        user_id: UUID,
        item_type: MemoryItemType,
        key: str,
        value,
        confidence: float,
        source: MemorySource,
        requires_confirmation: bool,
        prompt_user: str | None,
        expires_at: datetime | None = None,
    ) -> SemanticMemoryItem:
        item = SemanticMemoryItem(
            user_id=user_id,
            item_type=item_type,
            key=key,
            value=value,
            confidence=max(0.0, min(1.0, confidence)),
            source=source,
            requires_confirmation=requires_confirmation,
            is_confirmed=not requires_confirmation and source == MemorySource.EXPLICIT,
            prompt_user=prompt_user,
            expires_at=expires_at,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def confirm_memory_item(self, user_id: UUID, item_id: UUID) -> SemanticMemoryItem | None:
        stmt = select(SemanticMemoryItem).where(
            SemanticMemoryItem.user_id == user_id,
            SemanticMemoryItem.id == item_id,
        )
        item = await self.session.scalar(stmt)
        if item is None:
            return None

        item.is_confirmed = True
        item.requires_confirmation = False
        await self.session.flush()
        return item

    async def reject_memory_item(self, user_id: UUID, item_id: UUID) -> SemanticMemoryItem | None:
        stmt = select(SemanticMemoryItem).where(
            SemanticMemoryItem.user_id == user_id,
            SemanticMemoryItem.id == item_id,
        )
        item = await self.session.scalar(stmt)
        if item is None:
            return None

        await self.session.delete(item)
        await self.session.flush()
        return item

    async def create_observation(
        self,
        observation_type: ObservationType,
        summary: str,
        impact: ImpactLevel,
        examples_anonymized: list[str] | None = None,
        user_id: UUID | None = None,
    ) -> Observation:
        item = Observation(
            user_id=user_id,
            observation_type=observation_type,
            summary=summary,
            examples_anonymized=examples_anonymized or [],
            impact=impact,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_observations_since(self, since: datetime) -> list[Observation]:
        stmt = select(Observation).where(Observation.created_at >= since).order_by(desc(Observation.created_at))
        result = await self.session.scalars(stmt)
        return result.all()

    async def create_kb_patch(
        self,
        patch_payload: dict,
        proposed_by_user_id: UUID | None = None,
        kb_entry_id: UUID | None = None,
    ) -> AdminKbPatch:
        item = AdminKbPatch(
            kb_entry_id=kb_entry_id,
            proposed_by_user_id=proposed_by_user_id,
            patch_payload=patch_payload,
            status=KBPatchStatus.PENDING,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def get_kb_patch(self, patch_id: UUID) -> AdminKbPatch | None:
        stmt = select(AdminKbPatch).where(AdminKbPatch.id == patch_id)
        return await self.session.scalar(stmt)

    async def list_pending_kb_patches(self, limit: int = 100) -> list[AdminKbPatch]:
        stmt = (
            select(AdminKbPatch)
            .where(AdminKbPatch.status == KBPatchStatus.PENDING)
            .order_by(desc(AdminKbPatch.created_at))
            .limit(limit)
        )
        result = await self.session.scalars(stmt)
        return result.all()

    async def get_kb_entry_by_slug(self, slug: str) -> KnowledgeBaseEntry | None:
        stmt = select(KnowledgeBaseEntry).where(KnowledgeBaseEntry.slug == slug)
        return await self.session.scalar(stmt)

    async def upsert_kb_entry(
        self,
        *,
        slug: str,
        title: str,
        content: str,
        tags: list[str] | None = None,
        status: KnowledgeStatus = KnowledgeStatus.APPROVED,
    ) -> KnowledgeBaseEntry:
        item = await self.get_kb_entry_by_slug(slug)
        if item is None:
            item = KnowledgeBaseEntry(
                slug=slug,
                title=title,
                content=content,
                status=status,
                tags=tags or [],
                version=1,
            )
            self.session.add(item)
        else:
            item.title = title
            item.content = content
            item.tags = tags or item.tags
            item.status = status
            item.version = max(1, int(item.version or 1) + 1)

        await self.session.flush()
        return item

    async def approve_kb_patch(self, patch: AdminKbPatch, reviewer_user_id: UUID | None = None) -> AdminKbPatch:
        patch.status = KBPatchStatus.APPROVED
        patch.reviewed_by_user_id = reviewer_user_id
        patch.reviewed_at = datetime.now(timezone.utc)
        patch.rejection_reason = None
        await self.session.flush()
        return patch

    async def reject_kb_patch(self, patch: AdminKbPatch, reason: str, reviewer_user_id: UUID | None = None) -> AdminKbPatch:
        patch.status = KBPatchStatus.REJECTED
        patch.reviewed_by_user_id = reviewer_user_id
        patch.reviewed_at = datetime.now(timezone.utc)
        patch.rejection_reason = reason
        await self.session.flush()
        return patch
