from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.core.enums import AIChatType, AssistantMode, KBPatchStatus, MemoryItemType
from app.repositories.assistant import AssistantRepository
from app.schemas.ai_assistant import AIResultEnvelope, ProposedAction
from app.services.ai.service import AIService


class FakeRedis:
    def __init__(self) -> None:
        self.storage: dict[str, str] = {}

    async def setex(self, key: str, _: int, value: str) -> None:
        self.storage[key] = value

    async def get(self, key: str) -> str | None:
        return self.storage.get(key)

    async def delete(self, key: str) -> None:
        self.storage.pop(key, None)


@dataclass
class FakeMemoryItem:
    id: UUID
    item_type: MemoryItemType
    key: str
    value: dict


class FakeAssistantRepo:
    def __init__(self) -> None:
        self.mode_calls: list[tuple[UUID, AssistantMode]] = []
        self.preferences: dict[str, object] = {}
        self.items: dict[UUID, FakeMemoryItem] = {}

    async def set_default_mode(self, user_id: UUID, mode: AssistantMode):
        self.mode_calls.append((user_id, mode))
        return SimpleNamespace(user_id=user_id, default_mode=mode)

    async def set_preference(self, _user_id: UUID, key: str, value):
        self.preferences[key] = value
        return SimpleNamespace(preferences=self.preferences)

    async def set_style_signal(self, _user_id: UUID, key: str, value):
        self.preferences[key] = value
        return SimpleNamespace(style_signals=self.preferences)

    async def create_semantic_memory_item(
        self,
        *,
        user_id: UUID,
        item_type: MemoryItemType,
        key: str,
        value,
        confidence: float,
        source,
        requires_confirmation: bool,
        prompt_user: str | None,
        expires_at=None,
    ):
        item_id = uuid4()
        item = FakeMemoryItem(
            id=item_id,
            item_type=item_type,
            key=key,
            value=value if isinstance(value, dict) else {"value": value},
        )
        self.items[item_id] = item
        return item

    async def confirm_memory_item(self, _user_id: UUID, item_id: UUID):
        return self.items.get(item_id)

    async def reject_memory_item(self, _user_id: UUID, item_id: UUID):
        return self.items.pop(item_id, None)


class DummySession:
    async def flush(self) -> None:
        return None


class FakeEventService:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, object]] = []

    async def create_event(self, user_id: UUID, payload):
        self.calls.append((user_id, payload))
        return SimpleNamespace(
            id=uuid4(),
            title=payload.title,
            start_at=payload.start_at,
            location_text=getattr(payload, "location_text", None),
        )


def _new_service() -> AIService:
    service = AIService.__new__(AIService)
    service.redis = FakeRedis()
    service.assistant_repo = FakeAssistantRepo()
    service.tools = SimpleNamespace(
        is_in_domain=lambda _text, now_local=None: True,
        detect_intent=lambda _text, now_local=None: "general",
        try_parse_task=lambda _text, now_local=None: None,
    )
    return service


@pytest.mark.asyncio
async def test_set_assistant_mode_persists_cross_chat_profile_memory():
    service = _new_service()
    user_id = uuid4()
    action = ProposedAction(
        type="set_mode",
        payload={"default_mode": "PLANNER"},
        priority=1,
        safety={"needs_confirmation": False, "reason": None},
    )

    result = await service._execute_action(user_id, action)

    assert result.success is True
    assert service.assistant_repo.mode_calls == [(user_id, AssistantMode.PLANNER)]


@pytest.mark.asyncio
async def test_inferred_memory_suggestion_requires_confirm_then_persists():
    service = _new_service()
    user_id = uuid4()
    session_id = uuid4()

    envelope = AIResultEnvelope(
        request_id=str(uuid4()),
        mode=AssistantMode.AUTO,
        intent="general_question",
        confidence=0.8,
        requires_user_input=False,
        clarifying_question=None,
        proposed_actions=[],
        options=[],
        planner_summary={"conflicts": [], "warnings": [], "travel_time_notes": []},
        memory_suggestions=[
            {
                "type": "preference",
                "key": "no_meetings_before",
                "value": "10:00",
                "confidence": 0.72,
                "source": "inferred",
                "requires_confirmation": True,
                "prompt_user": "Save preference?",
            }
        ],
        observations_to_log=[],
        user_message="",
    )

    prompts = await service._store_memory_suggestions(user_id, session_id, envelope)
    pending = await service._load_pending_memory_items(session_id)
    assert prompts == ["Save preference?"]
    assert len(pending) == 1

    _ = await service._handle_memory_confirmation(user_id, session_id, "yes")
    assert service.assistant_repo.preferences["no_meetings_before"] == "10:00"

    pending_after = await service._load_pending_memory_items(session_id)
    assert pending_after == []


@pytest.mark.asyncio
async def test_fallback_when_ai_assistant_unavailable_returns_deterministic_planner_draft():
    service = _new_service()
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    service.tools = SimpleNamespace(
        is_in_domain=lambda _text, now_local=None: True,
        try_parse_task=lambda _text, now_local=None: SimpleNamespace(
            title="Sync",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=1, hours=1),
            location_text=None,
            reminder_offset=None,
            has_explicit_date=True,
        ),
    )

    envelope = await service._build_fallback_envelope(
        request_id=uuid4(),
        mode=AssistantMode.PLANNER,
        message="schedule meeting tomorrow",
        reason="ai_assistant_circuit_open",
        now_local=datetime.now(timezone.utc),
    )

    assert envelope.intent == "fallback"
    assert envelope.reason_code in {"backend_unavailable", "unknown"}
    assert envelope.requires_user_input is False
    assert len(envelope.proposed_actions) == 1
    assert envelope.proposed_actions[0].type == "create_event"


@pytest.mark.asyncio
async def test_admin_approve_kb_patch_changes_status_and_review_metadata():
    repo = AssistantRepository(DummySession())  # type: ignore[arg-type]
    reviewer_id = uuid4()
    patch = SimpleNamespace(
        status=KBPatchStatus.PENDING,
        reviewed_by_user_id=None,
        reviewed_at=None,
        rejection_reason="old",
    )

    updated = await repo.approve_kb_patch(patch, reviewer_user_id=reviewer_id)

    assert updated.status == KBPatchStatus.APPROVED
    assert updated.reviewed_by_user_id == reviewer_id
    assert updated.reviewed_at is not None
    assert updated.rejection_reason is None


def test_enforce_max_one_clarifying_question_rule():
    envelope = AIResultEnvelope(
        request_id=str(uuid4()),
        mode=AssistantMode.AUTO,
        intent="create_event",
        confidence=0.5,
        requires_user_input=True,
        clarifying_question="First question? Second question?",
        proposed_actions=[],
        options=[],
        planner_summary={"conflicts": [], "warnings": [], "travel_time_notes": []},
        memory_suggestions=[],
        observations_to_log=[],
        user_message="",
    )

    normalized = AIService._enforce_single_question(envelope)
    assert normalized.clarifying_question is not None
    assert normalized.clarifying_question.count("?") == 1


def test_compose_action_message_ignores_optimistic_base_when_action_failed():
    results = [
        SimpleNamespace(action_type="create_event", success=False, message="Could not create event: title and start_at are required."),
    ]
    message = AIService._compose_action_message(
        "Создаю встречу 'Встреча с Начальством' на завтра с 12:00 до 15:00 в ДГТУ Ростов-на-Дону.",
        results,  # type: ignore[arg-type]
    )

    assert "Создаю встречу" not in message
    assert "Could not create event" in message


@pytest.mark.asyncio
async def test_create_event_normalizes_alternative_payload_keys():
    service = _new_service()
    service.event_service = FakeEventService()
    user_id = uuid4()
    action = ProposedAction(
        type="create_event",
        payload={
            "name": "Встреча с Начальством",
            "date": "2026-02-21",
            "time_from": "12:00",
            "time_to": "15:00",
            "location": "ДГТУ Ростов-на-Дону",
        },
        priority=1,
        safety={"needs_confirmation": False, "reason": None},
    )

    result = await service._execute_action(user_id, action)

    assert result.success is True
    assert "событие" in result.message.lower()


@pytest.mark.asyncio
async def test_create_event_uses_source_message_when_payload_is_incomplete():
    service = _new_service()
    service.event_service = FakeEventService()
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    service.tools = SimpleNamespace(
        is_in_domain=lambda _text, now_local=None: True,
        detect_intent=lambda _text, now_local=None: "create_event",
        try_parse_task=lambda _text, now_local=None: SimpleNamespace(
            title="Встреча с начальством",
            start_at=now + timedelta(days=1, hours=12),
            end_at=now + timedelta(days=1, hours=15),
            location_text="ДГТУ Ростов-на-Дону",
            reminder_offset=None,
            has_explicit_date=True,
        ),
    )
    user_id = uuid4()
    action = ProposedAction(
        type="create_event",
        payload={"source_message": "завтра встреча с начальством с 12:00 до 15:00. Место: ДГТУ Ростов-на-Дону"},
        priority=1,
        safety={"needs_confirmation": False, "reason": None},
    )

    result = await service._execute_action(user_id, action)

    assert result.success is True
    assert "событие" in result.message.lower()


def test_deterministic_planner_fast_path_builds_create_event_action():
    service = _new_service()
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    service.tools = SimpleNamespace(
        is_in_domain=lambda _text, now_local=None: True,
        detect_intent=lambda _text, now_local=None: "create_event",
        try_parse_task=lambda _text, now_local=None: SimpleNamespace(
            title="Встреча с начальством",
            start_at=now + timedelta(days=1, hours=12),
            end_at=now + timedelta(days=1, hours=15),
            location_text="ДГТУ Ростов-на-Дону",
            reminder_offset=None,
            has_explicit_date=True,
        ),
    )

    envelope = service._try_deterministic_planner_envelope(
        request_id=uuid4(),
        mode=AssistantMode.PLANNER,
        message="завтра встреча с начальством с 12:00 до 15:00. Место: ДГТУ Ростов-на-Дону",
        target_chat_type=AIChatType.PLANNER,
        now_local=datetime.now(timezone.utc),
    )

    assert envelope is not None
    assert envelope.intent == "create_event"
    assert len(envelope.proposed_actions) == 1
    assert envelope.proposed_actions[0].type == "create_event"
