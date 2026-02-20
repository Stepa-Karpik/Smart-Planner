from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.core.enums import AIChatType, AssistantMode
from app.core.exceptions import ConflictError
from app.services.ai.service import AIService


@dataclass
class FakeSessionObj:
    id: UUID
    user_id: UUID
    chat_type: AIChatType
    display_index: int
    is_deleted: bool = False


class FakeSessionRepo:
    def __init__(self) -> None:
        self.sessions: dict[UUID, FakeSessionObj] = {}
        self.message_counts: dict[UUID, int] = {}

    async def create_session(self, user_id: UUID, chat_type: AIChatType) -> FakeSessionObj:
        existing = [item for item in self.sessions.values() if item.user_id == user_id]
        next_index = (max((item.display_index for item in existing), default=0) + 1) if existing else 1
        item = FakeSessionObj(id=uuid4(), user_id=user_id, chat_type=chat_type, display_index=next_index)
        self.sessions[item.id] = item
        self.message_counts.setdefault(item.id, 0)
        return item

    async def get_latest_session_by_type(self, user_id: UUID, chat_type: AIChatType) -> FakeSessionObj | None:
        items = [
            item
            for item in self.sessions.values()
            if item.user_id == user_id and item.chat_type == chat_type and not item.is_deleted
        ]
        if not items:
            return None
        return max(items, key=lambda item: item.display_index)

    async def get_session(self, user_id: UUID, session_id: UUID, *, include_deleted: bool = False) -> FakeSessionObj | None:
        item = self.sessions.get(session_id)
        if item is None or item.user_id != user_id:
            return None
        if not include_deleted and item.is_deleted:
            return None
        return item

    async def is_session_empty(self, _user_id: UUID, session_id: UUID) -> bool:
        return int(self.message_counts.get(session_id, 0)) == 0

    async def update_session_chat_type(self, session_obj: FakeSessionObj, chat_type: AIChatType) -> FakeSessionObj:
        session_obj.chat_type = chat_type
        return session_obj

    async def list_sessions(self, user_id: UUID):
        return [item for item in self.sessions.values() if item.user_id == user_id and not item.is_deleted]

    async def list_messages(self, _user_id: UUID, _session_id: UUID):
        return []

    async def soft_delete_session(self, user_id: UUID, session_id: UUID):
        item = await self.get_session(user_id, session_id)
        if item is None:
            return None
        item.is_deleted = True
        return item


class FakeProfileRepo:
    def __init__(self) -> None:
        self.default_mode: AssistantMode = AssistantMode.AUTO

    async def get_or_create_profile_memory(self, _user_id: UUID):
        return SimpleNamespace(default_mode=self.default_mode)

    async def set_default_mode(self, _user_id: UUID, mode: AssistantMode):
        self.default_mode = mode
        return SimpleNamespace(default_mode=mode)


class FakeDbSession:
    async def commit(self) -> None:
        return None


def _build_service() -> AIService:
    service = AIService.__new__(AIService)
    service.repo = FakeSessionRepo()
    service.assistant_repo = FakeProfileRepo()
    service.tools = SimpleNamespace(is_in_domain=lambda text: bool(text and "schedule" in text.lower()))
    service.session = FakeDbSession()
    return service


@pytest.mark.asyncio
async def test_chat_indexing_is_monotonic_per_user():
    service = _build_service()
    user_id = uuid4()

    first = await service.create_session(user_id, AIChatType.PLANNER)
    second = await service.create_session(user_id, AIChatType.COMPANION)
    third = await service.create_session(user_id, AIChatType.PLANNER)

    assert first.display_index == 1
    assert second.display_index == 2
    assert third.display_index == 3


@pytest.mark.asyncio
async def test_mode_switch_for_non_empty_chat_is_forbidden_without_new_chat_flag():
    service = _build_service()
    user_id = uuid4()
    current = await service.create_session(user_id, AIChatType.COMPANION)
    service.repo.message_counts[current.id] = 2

    with pytest.raises(ConflictError):
        await service.set_default_mode(
            user_id,
            AssistantMode.PLANNER,
            session_id=current.id,
            create_new_chat=False,
        )


@pytest.mark.asyncio
async def test_mode_switch_for_non_empty_chat_creates_new_chat_when_allowed():
    service = _build_service()
    user_id = uuid4()
    current = await service.create_session(user_id, AIChatType.COMPANION)
    service.repo.message_counts[current.id] = 3

    mode, active = await service.set_default_mode(
        user_id,
        AssistantMode.PLANNER,
        session_id=current.id,
        create_new_chat=True,
    )

    assert mode == AssistantMode.PLANNER
    assert active is not None
    assert active.id != current.id
    assert active.chat_type == AIChatType.PLANNER


@pytest.mark.asyncio
async def test_mode_switch_for_non_empty_chat_with_existing_target_is_still_forbidden():
    service = _build_service()
    user_id = uuid4()
    current = await service.create_session(user_id, AIChatType.COMPANION)
    _ = await service.create_session(user_id, AIChatType.PLANNER)
    service.repo.message_counts[current.id] = 5

    with pytest.raises(ConflictError):
        await service.set_default_mode(
            user_id,
            AssistantMode.PLANNER,
            session_id=current.id,
            create_new_chat=False,
        )


@pytest.mark.asyncio
async def test_mode_switch_can_retype_empty_chat():
    service = _build_service()
    user_id = uuid4()
    current = await service.create_session(user_id, AIChatType.COMPANION)
    service.repo.message_counts[current.id] = 0

    mode, active = await service.set_default_mode(
        user_id,
        AssistantMode.PLANNER,
        session_id=current.id,
        create_new_chat=False,
    )

    assert mode == AssistantMode.PLANNER
    assert active is not None
    assert active.id == current.id
    assert active.chat_type == AIChatType.PLANNER


@pytest.mark.asyncio
async def test_requested_session_with_other_chat_type_does_not_mix_histories():
    service = _build_service()
    user_id = uuid4()
    companion = await service.create_session(user_id, AIChatType.COMPANION)
    planner = await service.create_session(user_id, AIChatType.PLANNER)

    resolved = await service._resolve_session_for_chat_type(
        user_id=user_id,
        requested_session_id=companion.id,
        target_chat_type=AIChatType.PLANNER,
    )

    assert resolved.id == planner.id
    assert resolved.chat_type == AIChatType.PLANNER
