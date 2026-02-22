from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import (
    AIChatType,
    AIRole,
    AITaskStatus,
    AssistantMode,
    EventLocationSource,
    EventStatus,
    ImpactLevel,
    MemoryItemType,
    MemorySource,
    ObservationType,
)
from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.ai import AIRepository
from app.repositories.assistant import AssistantRepository
from app.repositories.user import UserRepository
from app.schemas.ai_assistant import (
    AIInterpretRequest,
    AIProposeRequest,
    AIResultEnvelope,
    ContextPack,
    ProposedAction,
    ProposedOption,
    ValidationResult,
)
from app.schemas.event import EventCreate, EventUpdate
from app.services.ai.assistant_client import AIAssistantClient, AssistantClientError
from app.services.ai.providers import build_providers
from app.services.ai.tools import AITools
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.user_timezone import UserTimezoneService

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ActionExecutionResult:
    action_type: str
    success: bool
    message: str
    meta: Literal["create", "update", "delete", "info"] = "info"


@dataclass(slots=True)
class ChatResult:
    session_id: UUID
    answer: str
    chat_type: AIChatType | None = None
    display_index: int | None = None
    mode: AssistantMode | None = None
    intent: str | None = None
    fallback_reason_code: str | None = None
    requires_user_input: bool = False
    clarifying_question: str | None = None
    options: list[dict[str, Any]] | None = None
    memory_suggestions: list[dict[str, Any]] | None = None
    planner_summary: dict[str, Any] | None = None
    response_meta: Literal["create", "update", "delete", "info"] | None = None


class AIService:
    def __init__(
        self,
        session: AsyncSession,
        redis: Redis,
        event_service: EventService,
        feasibility_service: TravelFeasibilityService,
    ) -> None:
        self.settings = get_settings()
        self.session = session
        self.redis = redis
        self.repo = AIRepository(session)
        self.assistant_repo = AssistantRepository(session)
        self.users = UserRepository(session)
        self.tools = AITools(event_service)
        self.event_service = event_service
        self.feasibility_service = feasibility_service
        self.assistant_client = AIAssistantClient()
        self.providers = build_providers()

    @staticmethod
    def _pending_options_key(session_id: UUID) -> str:
        return f"ai:pending_options:{session_id}"

    @staticmethod
    def _pending_memory_key(session_id: UUID) -> str:
        return f"ai:pending_memory:{session_id}"

    @staticmethod
    def _focus_event_key(session_id: UUID) -> str:
        return f"ai:focus_event:{session_id}"

    @staticmethod
    def _pending_title_update_key(session_id: UUID) -> str:
        return f"ai:pending_title_update:{session_id}"

    @staticmethod
    def _pending_followup_key(session_id: UUID) -> str:
        return f"ai:pending_followup:{session_id}"

    @staticmethod
    def _strip_meta_prefix(text: str) -> str:
        return re.sub(r"^\[\[meta:[a-z_]+]]\s*", "", text).strip()

    @staticmethod
    def _with_meta(meta: str, text: str) -> str:
        return f"[[meta:{meta}]] {text}"

    @staticmethod
    def _parse_iso(value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value)
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                return None
        return None

    @staticmethod
    def _parse_uuid(value: Any) -> UUID | None:
        if value is None:
            return None
        if isinstance(value, UUID):
            return value
        try:
            return UUID(str(value))
        except Exception:
            return None

    @staticmethod
    def _to_int(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            raw = value.strip()
            if raw.isdigit():
                return int(raw)
        return None

    @staticmethod
    def _combine_date_time(date_part: Any, time_part: Any) -> str | None:
        if not date_part or not time_part:
            return None
        date_raw = str(date_part).strip()
        time_raw = str(time_part).strip()
        if not date_raw or not time_raw:
            return None
        if "T" in date_raw or " " in date_raw:
            return f"{date_raw} {time_raw}"
        return f"{date_raw}T{time_raw}"

    @classmethod
    def _normalize_create_event_payload(cls, payload: Any) -> dict[str, Any]:
        data = payload if isinstance(payload, dict) else {}
        nested_event = data.get("event") if isinstance(data.get("event"), dict) else {}

        title = str(
            data.get("title")
            or data.get("name")
            or data.get("event_title")
            or data.get("subject")
            or nested_event.get("title")
            or ""
        ).strip()

        start_at = (
            data.get("start_at")
            or data.get("starts_at")
            or data.get("start")
            or data.get("datetime_start")
            or data.get("from")
            or nested_event.get("start_at")
            or nested_event.get("start")
        )
        end_at = (
            data.get("end_at")
            or data.get("ends_at")
            or data.get("end")
            or data.get("datetime_end")
            or data.get("to")
            or nested_event.get("end_at")
            or nested_event.get("end")
        )

        date_part = data.get("date") or data.get("start_date") or data.get("day")
        start_time = data.get("start_time") or data.get("time_from") or data.get("from_time") or data.get("time")
        end_time = data.get("end_time") or data.get("time_to") or data.get("to_time")

        if start_at is None:
            if isinstance(start_time, str) and cls._parse_iso(start_time) is not None:
                start_at = start_time
            else:
                start_at = cls._combine_date_time(date_part, start_time)
        if end_at is None:
            if isinstance(end_time, str) and cls._parse_iso(end_time) is not None:
                end_at = end_time
            else:
                end_at = cls._combine_date_time(date_part, end_time)

        duration_minutes = cls._to_int(
            data.get("duration_minutes")
            or data.get("duration")
            or data.get("duration_min")
            or data.get("minutes")
        )

        return {
            "title": title,
            "start_at": start_at,
            "end_at": end_at,
            "duration_minutes": duration_minutes,
            "location_text": (
                data.get("location_text")
                or data.get("location")
                or data.get("place")
                or data.get("address")
            ),
            "location_lat": data.get("location_lat") if "location_lat" in data else data.get("lat"),
            "location_lon": data.get("location_lon") if "location_lon" in data else data.get("lon"),
            "notes": data.get("notes") if "notes" in data else data.get("description"),
            "source_message": data.get("source_message") or data.get("__source_message"),
        }

    @classmethod
    def _normalize_update_event_payload(cls, payload: Any) -> dict[str, Any]:
        data = payload if isinstance(payload, dict) else {}
        patch_raw = data.get("patch") if isinstance(data.get("patch"), dict) else {}
        event_data = data.get("event") if isinstance(data.get("event"), dict) else {}

        patch: dict[str, Any] = {}

        def read(*keys: str):
            for key in keys:
                if key in patch_raw:
                    return patch_raw.get(key)
                if key in data:
                    return data.get(key)
                if key in event_data:
                    return event_data.get(key)
            return None

        title = read("title", "name", "new_title", "event_title", "subject")
        if isinstance(title, str) and title.strip():
            patch["title"] = title.strip()

        description = read("description", "notes")
        if description is not None:
            patch["description"] = description

        location_text = read("location_text", "location", "place", "address")
        if location_text is not None:
            patch["location_text"] = location_text

        location_lat = read("location_lat", "lat")
        location_lon = read("location_lon", "lon")
        if location_lat is not None:
            patch["location_lat"] = location_lat
        if location_lon is not None:
            patch["location_lon"] = location_lon

        for key in ("all_day", "priority"):
            value = read(key)
            if value is not None:
                patch[key] = value

        start_at = read("start_at", "starts_at", "start", "datetime_start", "from")
        end_at = read("end_at", "ends_at", "end", "datetime_end", "to")
        if start_at is None:
            date_part = read("date", "start_date", "day")
            start_time = read("start_time", "time_from", "from_time", "time")
            if isinstance(start_time, str) and cls._parse_iso(start_time) is not None:
                start_at = start_time
            else:
                start_at = cls._combine_date_time(date_part, start_time)
        if end_at is None:
            date_part = read("date", "start_date", "day")
            end_time = read("end_time", "time_to", "to_time")
            if isinstance(end_time, str) and cls._parse_iso(end_time) is not None:
                end_at = end_time
            else:
                end_at = cls._combine_date_time(date_part, end_time)

        if start_at is not None:
            patch["start_at"] = start_at
        if end_at is not None:
            patch["end_at"] = end_at

        event_id = (
            data.get("event_id")
            or data.get("id")
            or event_data.get("event_id")
            or event_data.get("id")
            or patch_raw.get("event_id")
            or patch_raw.get("id")
        )

        return {
            "event_id": event_id,
            "patch": patch,
            "source_message": data.get("source_message") or data.get("__source_message"),
        }

    @staticmethod
    def _normalize_event_title(value: Any) -> str:
        text = str(value or "").strip().lower()
        text = re.sub(r"[\s\"'`«»“”„‟]+", " ", text)
        return text.strip()

    @classmethod
    def _extract_quoted_values(cls, text: str) -> list[str]:
        values: list[str] = []
        for pattern in (
            r"\"([^\"]{1,220})\"",
            r"«([^»]{1,220})»",
            r"'([^']{1,220})'",
        ):
            for match in re.finditer(pattern, text):
                value = match.group(1).strip()
                if value and value not in values:
                    values.append(value)
        return values

    @classmethod
    def _extract_rename_details(cls, text: str) -> tuple[str | None, str | None]:
        normalized = text.strip()
        lower = normalized.lower()
        rename_markers = ("переимен", "назван", "rename", "title", "name", "поменя")
        if not any(marker in lower for marker in rename_markers):
            return None, None

        quoted = cls._extract_quoted_values(normalized)
        new_title: str | None = None
        target_title: str | None = None

        match_new = re.search(
            r"(?:на|to)\s+(?:название\s+)?(?:\"([^\"]{1,220})\"|«([^»]{1,220})»|'([^']{1,220})')",
            normalized,
            flags=re.IGNORECASE,
        )
        if match_new:
            new_title = next((part.strip() for part in match_new.groups() if part and part.strip()), None)

        match_target = re.search(
            r"(?:у|для|событи[ея]|event)\s+(?:\"([^\"]{1,220})\"|«([^»]{1,220})»|'([^']{1,220})')",
            normalized,
            flags=re.IGNORECASE,
        )
        if match_target:
            target_title = next((part.strip() for part in match_target.groups() if part and part.strip()), None)

        if len(quoted) >= 2:
            if new_title is None:
                new_title = quoted[0]
            if target_title is None:
                target_title = quoted[1]
        elif len(quoted) == 1 and new_title is None:
            new_title = quoted[0]

        if isinstance(new_title, str):
            new_title = new_title.strip().strip(".,;:!?")
        if isinstance(target_title, str):
            target_title = target_title.strip().strip(".,;:!?")

        return (new_title or None), (target_title or None)

    @staticmethod
    def _normalize_pending_title_value(text: str) -> str | None:
        value = text.strip()
        if not value:
            return None

        value = re.sub(r"^(просто|это|название|пусть будет)\s+", "", value, flags=re.IGNORECASE).strip()
        value = value.strip().strip(".,;:!?")
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("«") and value.endswith("»")):
            value = value[1:-1].strip()
        if (value.startswith("'") and value.endswith("'")):
            value = value[1:-1].strip()

        if not value or len(value) > 220:
            return None
        if value.endswith("?"):
            return None
        return value

    @staticmethod
    def _is_rename_request(text: str) -> bool:
        lower = text.lower()
        if not lower:
            return False
        return any(
            marker in lower
            for marker in (
                "переимен",
                "поменяй название",
                "измени название",
                "назови",
                "rename",
                "change title",
                "change name",
            )
        )

    @staticmethod
    def _detect_language(text: str) -> str:
        cyr = len(re.findall(r"[\u0400-\u04FF]", text.lower()))
        lat = len(re.findall(r"[a-z]", text.lower()))
        if cyr > lat:
            return "ru"
        if lat > 0:
            return "en"
        return "ru"

    @staticmethod
    def _safe_zoneinfo(tz_name: str) -> ZoneInfo:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            return ZoneInfo("Europe/Moscow")

    @classmethod
    def _to_user_local(cls, value: datetime, tz_name: str) -> datetime:
        aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return aware.astimezone(cls._safe_zoneinfo(tz_name))

    @classmethod
    def _format_local_datetime(cls, value: datetime, tz_name: str, language: str) -> str:
        local = cls._to_user_local(value, tz_name)
        if language == "en":
            return local.strftime("%Y-%m-%d %H:%M")
        return local.strftime("%d.%m.%Y %H:%M")

    @staticmethod
    def _is_positive_reply(text: str) -> bool:
        normalized = text.lower().strip()
        return normalized in {
            "yes",
            "y",
            "ok",
            "sure",
            "confirm",
            "да",
            "ага",
            "ок",
            "подтверждаю",
        }

    @staticmethod
    def _is_negative_reply(text: str) -> bool:
        normalized = text.lower().strip()
        return normalized in {
            "no",
            "n",
            "nope",
            "cancel",
            "нет",
            "неа",
            "отмена",
            "не сохраняй",
        }

    @staticmethod
    def _extract_number_choice(text: str) -> int | None:
        match = re.match(r"^\s*(\d{1,2})\s*$", text)
        if not match:
            return None
        return int(match.group(1))

    @staticmethod
    def _extract_mode_override(message: str) -> tuple[AssistantMode | None, str]:
        text = message.strip()
        lower = text.lower()

        for prefix, mode in (
            ("planner:", AssistantMode.PLANNER),
            ("companion:", AssistantMode.COMPANION),
            ("auto:", AssistantMode.AUTO),
        ):
            if lower.startswith(prefix):
                clean = text[len(prefix) :].strip()
                return mode, clean or text

        if "ответь как планировщик" in lower:
            clean = re.sub(r"ответь как планировщик[:\s-]*", "", text, flags=re.IGNORECASE).strip()
            return AssistantMode.PLANNER, clean or text
        if "ответь как помощник" in lower or "ответь как companion" in lower:
            clean = re.sub(r"ответь как (помощник|companion)[:\s-]*", "", text, flags=re.IGNORECASE).strip()
            return AssistantMode.COMPANION, clean or text
        if "ответь в авто режиме" in lower:
            clean = re.sub(r"ответь в авто режиме[:\s-]*", "", text, flags=re.IGNORECASE).strip()
            return AssistantMode.AUTO, clean or text

        return None, message

    @staticmethod
    def _map_reason_code(raw_reason: str) -> Literal["provider_error", "timeout", "rate_limit", "backend_unavailable", "unknown"]:
        reason = (raw_reason or "").lower()
        if any(marker in reason for marker in ("healthcheck", "circuit_open", "circuit", "connection", "network")):
            return "backend_unavailable"
        if "timeout" in reason:
            return "timeout"
        if "429" in reason or "rate" in reason or "limit" in reason:
            return "rate_limit"
        if "backend" in reason or "database" in reason or "db" in reason:
            return "backend_unavailable"
        if "provider" in reason or "openai" in reason or "deepseek" in reason or "model" in reason:
            return "provider_error"
        return "unknown"

    @staticmethod
    def _build_fallback_user_message(
        *,
        planner_like: bool,
        actor_role: Literal["user", "admin"],
        reason_code: str,
        reason: str,
        language: str,
    ) -> str:
        if language == "en":
            base = (
                "AI is temporarily unavailable. I can show schedule/free slots and create an event manually."
                if planner_like
                else "AI is temporarily unavailable."
            )
        else:
            base = (
                "AI временно недоступен. Могу показать расписание/слоты и создать событие вручную."
                if planner_like
                else "AI временно недоступен."
            )
        if actor_role == "admin":
            return f"{base} [reason_code={reason_code}; details={reason[:180]}]"
        return base

    @staticmethod
    def _looks_like_list_events_request(text: str) -> bool:
        lower = text.lower()
        return any(
            marker in lower
            for marker in (
                "какие планы на сегодня",
                "что у меня сегодня",
                "покажи расписание",
                "расписание на сегодня",
                "plans for today",
                "what do i have today",
                "show schedule",
                "list events",
            )
        )

    @staticmethod
    def _looks_like_free_slots_request(text: str) -> bool:
        lower = text.lower()
        return any(
            marker in lower
            for marker in (
                "свобод",
                "окно",
                "free slot",
                "free time",
                "when am i free",
            )
        )

    @staticmethod
    def _extract_duration_minutes_from_text(text: str, default: int = 60) -> int:
        lower = text.lower()
        match = re.search(r"(\d{1,3})\s*(мин|minute|min)", lower)
        if not match:
            return max(15, min(480, int(default)))
        value = int(match.group(1))
        return max(15, min(480, value))

    @staticmethod
    def _attach_source_message_to_actions(actions: list[ProposedAction], message: str) -> list[ProposedAction]:
        source = message.strip()
        if not source:
            return actions

        enriched: list[ProposedAction] = []
        for action in actions:
            if action.type not in {"create_event", "update_event", "delete_event"}:
                enriched.append(action)
                continue
            payload = dict(action.payload)
            payload.setdefault("source_message", source)
            enriched.append(action.model_copy(update={"payload": payload}))
        return enriched

    def _try_deterministic_planner_envelope(
        self,
        *,
        request_id: UUID,
        mode: AssistantMode,
        message: str,
        target_chat_type: AIChatType,
        now_local: datetime,
    ) -> AIResultEnvelope | None:
        if target_chat_type != AIChatType.PLANNER:
            return None

        intent = self.tools.detect_intent(message)
        normalized = message.lower()
        now = now_local.astimezone(timezone.utc)

        if intent in {"list_tomorrow", "weekly_overview", "schedule_query"}:
            if "tomorrow" in normalized or "завтра" in normalized:
                range_value = "tomorrow"
            elif "week" in normalized or "недел" in normalized:
                range_value = "week"
            else:
                range_value = "today"
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="list_events",
                confidence=0.98,
                reason_code=None,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    ProposedAction(
                        type="list_events",
                        payload={"range": range_value, "date_from": None, "date_to": None},
                        priority=1,
                        safety={"needs_confirmation": False, "reason": None},
                    )
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message="",
            )

        if intent == "free_slots":
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="free_slots",
                confidence=0.98,
                reason_code=None,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    ProposedAction(
                        type="free_slots",
                        payload={
                            "date_from": now_local.date().isoformat(),
                            "date_to": (now_local + timedelta(days=2)).date().isoformat(),
                            "duration_minutes": self._extract_duration_minutes_from_text(message, default=60),
                            "work_hours_only": True,
                        },
                        priority=1,
                        safety={"needs_confirmation": False, "reason": None},
                    )
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message="",
            )

        if intent == "create_event":
            parsed = self.tools.try_parse_task(message, now_local=now_local)
            if parsed is None or not parsed.has_explicit_date:
                return None
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="create_event",
                confidence=0.99,
                reason_code=None,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    ProposedAction(
                        type="create_event",
                        payload={
                            "title": parsed.title,
                            "start_at": parsed.start_at.isoformat(),
                            "end_at": parsed.end_at.isoformat() if parsed.end_at else None,
                            "duration_minutes": None,
                            "location_text": parsed.location_text,
                            "location_id": None,
                            "reminder_offset_minutes": parsed.reminder_offset,
                            "flexibility": "unknown",
                            "notes": None,
                            "source_message": message,
                        },
                        priority=1,
                        safety={"needs_confirmation": False, "reason": None},
                    )
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message="",
            )

        return None

    async def _get_user(self, user_id: UUID):
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        return user

    @staticmethod
    def _mode_to_chat_type(mode: AssistantMode, message: str, tools: AITools) -> AIChatType:
        if mode == AssistantMode.PLANNER:
            return AIChatType.PLANNER
        if mode == AssistantMode.COMPANION:
            return AIChatType.COMPANION
        return AIChatType.PLANNER if tools.is_in_domain(message) else AIChatType.COMPANION

    @staticmethod
    def _chat_type_for_mode(mode: AssistantMode) -> AIChatType | None:
        if mode == AssistantMode.PLANNER:
            return AIChatType.PLANNER
        if mode == AssistantMode.COMPANION:
            return AIChatType.COMPANION
        return None

    async def _get_or_create_session_by_type(self, user_id: UUID, chat_type: AIChatType):
        current = await self.repo.get_latest_session_by_type(user_id, chat_type)
        if current is not None:
            return current
        return await self.repo.create_session(user_id, chat_type)

    async def _resolve_session_for_chat_type(
        self,
        *,
        user_id: UUID,
        requested_session_id: UUID | None,
        target_chat_type: AIChatType,
    ):
        if requested_session_id is None:
            return await self._get_or_create_session_by_type(user_id, target_chat_type)

        requested = await self.repo.get_session(user_id, requested_session_id)
        if requested is None:
            raise NotFoundError("AI session not found")
        if requested.chat_type != target_chat_type:
            return await self._get_or_create_session_by_type(user_id, target_chat_type)
        return requested

    async def _list_history_messages(self, user_id: UUID, session_id: UUID, limit: int = 20):
        return list(await self.repo.list_recent_messages(user_id, session_id, limit=limit))

    async def _build_context_pack(self, user_id: UUID, session_id: UUID) -> ContextPack:
        profile = await self.assistant_repo.get_or_create_profile_memory(user_id)
        summary = await self.assistant_repo.get_conversation_summary(user_id, session_id)
        window_limit = max(10, min(30, int(self.settings.ai_context_window_messages)))
        recent_messages = await self._list_history_messages(user_id, session_id, limit=window_limit)
        first_user_message = await self.repo.get_first_user_message(user_id, session_id)
        memory_items = await self.assistant_repo.list_semantic_memory_items(user_id, include_unconfirmed=False, limit=10)

        user_profile_summary = (
            f"mode={profile.default_mode.value}; proactivity={profile.proactivity_level}; "
            f"preferences={json.dumps(profile.preferences, ensure_ascii=False)}; "
            f"style={json.dumps(profile.style_signals, ensure_ascii=False)}"
        )

        window: list[dict[str, str]] = []
        for item in recent_messages:
            if item.role not in {AIRole.USER, AIRole.ASSISTANT}:
                continue
            text = self._strip_meta_prefix(item.content)
            if not text:
                continue
            window.append({"role": item.role.value, "content": text[:1200]})

        relevant_memory = [
            {
                "id": str(item.id),
                "type": item.item_type.value,
                "key": item.key,
                "value": item.value,
                "confidence": item.confidence,
                "source": item.source.value,
            }
            for item in memory_items
        ]

        summary_text = summary.summary if summary is not None else None
        if first_user_message is not None:
            first_text = self._strip_meta_prefix(first_user_message.content)
            if first_text:
                summary_prefix = f"FIRST_USER: {first_text[:220]}"
                if summary_text:
                    if "FIRST_USER:" not in summary_text:
                        summary_text = f"{summary_prefix}\n{summary_text}"
                else:
                    summary_text = summary_prefix

        return ContextPack(
            user_profile_summary=user_profile_summary,
            conversation_summary=summary_text,
            last_messages_window=window,
            relevant_memory_items=relevant_memory,
        )

    async def _save_conversation_summary(self, user_id: UUID, session_id: UUID) -> None:
        messages = await self._list_history_messages(user_id, session_id, limit=30)
        compact_lines: list[str] = []
        first_user = next((item for item in messages if item.role == AIRole.USER), None)
        if first_user is not None:
            first_text = self._strip_meta_prefix(first_user.content)
            if first_text:
                compact_lines.append(f"FIRST_USER: {first_text[:180]}")
        for item in messages[-12:]:
            if item.role not in {AIRole.USER, AIRole.ASSISTANT}:
                continue
            prefix = "U" if item.role == AIRole.USER else "A"
            compact = self._strip_meta_prefix(item.content)
            compact_lines.append(f"{prefix}: {compact[:180]}")

        summary_text = "\n".join(compact_lines)
        summary_text = summary_text[: max(300, int(self.settings.ai_context_summary_max_chars))]
        token_estimate = len(summary_text.split())
        await self.assistant_repo.upsert_conversation_summary(
            user_id=user_id,
            session_id=session_id,
            summary=summary_text,
            message_count=len(messages),
            token_estimate=token_estimate,
        )

    async def _store_pending_options(self, session_id: UUID, options: list[ProposedOption]) -> None:
        payload = [item.model_dump(mode="json") for item in options]
        await self.redis.setex(self._pending_options_key(session_id), 60 * 60, json.dumps(payload, ensure_ascii=False))

    async def _load_pending_options(self, session_id: UUID) -> list[ProposedOption]:
        raw = await self.redis.get(self._pending_options_key(session_id))
        if not raw:
            return []
        try:
            payload = json.loads(raw)
            if not isinstance(payload, list):
                return []
            return [ProposedOption.model_validate(item) for item in payload]
        except Exception:
            return []

    async def _clear_pending_options(self, session_id: UUID) -> None:
        await self.redis.delete(self._pending_options_key(session_id))

    async def _store_pending_memory_items(self, session_id: UUID, item_ids: list[UUID]) -> None:
        if not item_ids:
            return
        payload = [str(item_id) for item_id in item_ids]
        await self.redis.setex(self._pending_memory_key(session_id), 60 * 60 * 24, json.dumps(payload, ensure_ascii=False))

    async def _load_pending_memory_items(self, session_id: UUID) -> list[UUID]:
        raw = await self.redis.get(self._pending_memory_key(session_id))
        if not raw:
            return []
        try:
            payload = json.loads(raw)
            if not isinstance(payload, list):
                return []
            result: list[UUID] = []
            for item in payload:
                parsed = self._parse_uuid(item)
                if parsed is not None:
                    result.append(parsed)
            return result
        except Exception:
            return []

    async def _clear_pending_memory_items(self, session_id: UUID) -> None:
        await self.redis.delete(self._pending_memory_key(session_id))

    async def _store_focus_event(self, session_id: UUID, event: Any) -> None:
        event_id = self._parse_uuid(getattr(event, "id", None))
        if event_id is None:
            return
        payload = {
            "event_id": str(event_id),
            "title": str(getattr(event, "title", "") or ""),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.redis.setex(self._focus_event_key(session_id), 60 * 60 * 24 * 7, json.dumps(payload, ensure_ascii=False))

    async def _load_focus_event(self, session_id: UUID) -> dict[str, Any] | None:
        raw = await self.redis.get(self._focus_event_key(session_id))
        if not raw:
            return None
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                return None
            event_id = self._parse_uuid(payload.get("event_id"))
            if event_id is None:
                return None
            return {
                "event_id": str(event_id),
                "title": str(payload.get("title") or "").strip(),
            }
        except Exception:
            return None

    async def _clear_focus_event(self, session_id: UUID) -> None:
        await self.redis.delete(self._focus_event_key(session_id))

    async def _store_pending_title_update(self, session_id: UUID, event_id: UUID) -> None:
        payload = {"event_id": str(event_id)}
        await self.redis.setex(
            self._pending_title_update_key(session_id),
            60 * 30,
            json.dumps(payload, ensure_ascii=False),
        )

    async def _load_pending_title_update(self, session_id: UUID) -> UUID | None:
        raw = await self.redis.get(self._pending_title_update_key(session_id))
        if not raw:
            return None
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                return None
            return self._parse_uuid(payload.get("event_id"))
        except Exception:
            return None

    async def _clear_pending_title_update(self, session_id: UUID) -> None:
        await self.redis.delete(self._pending_title_update_key(session_id))

    async def _store_pending_followup(
        self,
        session_id: UUID,
        *,
        action_type: str,
        payload: dict[str, Any],
        source_message: str,
    ) -> None:
        if action_type not in {"create_event", "update_event"}:
            return
        payload_obj = payload if isinstance(payload, dict) else {}
        try:
            payload_obj = json.loads(json.dumps(payload_obj, ensure_ascii=False, default=str))
        except Exception:
            payload_obj = {}
        body = {
            "action_type": action_type,
            "payload": payload_obj,
            "source_message": source_message.strip(),
            "clarify_count": 1,
        }
        await self.redis.setex(
            self._pending_followup_key(session_id),
            60 * 30,
            json.dumps(body, ensure_ascii=False),
        )

    async def _load_pending_followup(self, session_id: UUID) -> dict[str, Any] | None:
        raw = await self.redis.get(self._pending_followup_key(session_id))
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        action_type = str(payload.get("action_type") or "").strip()
        if action_type not in {"create_event", "update_event"}:
            return None
        body = payload.get("payload")
        if not isinstance(body, dict):
            body = {}
        source_message = str(payload.get("source_message") or "").strip()
        clarify_count = self._to_int(payload.get("clarify_count")) or 1
        return {
            "action_type": action_type,
            "payload": body,
            "source_message": source_message,
            "clarify_count": max(1, clarify_count),
        }

    async def _clear_pending_followup(self, session_id: UUID) -> None:
        await self.redis.delete(self._pending_followup_key(session_id))

    async def _find_recent_event_by_title(self, user_id: UUID, title: str, now_local: datetime) -> Any | None:
        normalized_target = self._normalize_event_title(title)
        if not normalized_target:
            return None

        from_dt = (now_local - timedelta(days=90)).astimezone(timezone.utc)
        to_dt = (now_local + timedelta(days=365)).astimezone(timezone.utc)
        try:
            events = await self.event_service.list_events_range(user_id, from_dt, to_dt)
        except Exception:
            return None
        if not events:
            return None

        def event_start(item: Any) -> datetime:
            value = self._parse_iso(getattr(item, "start_at", None))
            if value is None:
                return now_local.astimezone(timezone.utc)
            return value

        def pick_best(candidates: list[Any]) -> Any | None:
            if not candidates:
                return None
            if len(candidates) == 1:
                return candidates[0]
            pivot = now_local.astimezone(timezone.utc)
            return min(candidates, key=lambda item: abs((event_start(item) - pivot).total_seconds()))

        exact = [
            item
            for item in events
            if self._normalize_event_title(getattr(item, "title", "")) == normalized_target
        ]
        best = pick_best(exact)
        if best is not None:
            return best

        contains = [
            item
            for item in events
            if normalized_target in self._normalize_event_title(getattr(item, "title", ""))
            or self._normalize_event_title(getattr(item, "title", "")) in normalized_target
        ]
        if len(contains) == 1:
            return contains[0]
        return None

    async def _resolve_update_event_reference(
        self,
        user_id: UUID,
        session_id: UUID | None,
        payload: dict[str, Any],
        source_message: str,
        now_local: datetime,
    ) -> tuple[UUID | None, Any | None]:
        event_id = self._parse_uuid(payload.get("event_id"))
        if event_id is not None:
            try:
                event = await self.event_service.get_event(user_id, event_id)
                return event_id, event
            except Exception:
                event_id = None

        if session_id is not None:
            focus = await self._load_focus_event(session_id)
            focus_id = self._parse_uuid((focus or {}).get("event_id"))
            if focus_id is not None:
                try:
                    event = await self.event_service.get_event(user_id, focus_id)
                    return focus_id, event
                except Exception:
                    await self._clear_focus_event(session_id)

        new_title, target_title = self._extract_rename_details(source_message)
        candidate_title = target_title
        if candidate_title:
            event = await self._find_recent_event_by_title(user_id, candidate_title, now_local)
            if event is not None:
                event_id = self._parse_uuid(getattr(event, "id", None))
                if event_id is not None:
                    return event_id, event

        quoted = self._extract_quoted_values(source_message)
        for title_candidate in quoted:
            if new_title and self._normalize_event_title(title_candidate) == self._normalize_event_title(new_title):
                continue
            event = await self._find_recent_event_by_title(user_id, title_candidate, now_local)
            if event is not None:
                event_id = self._parse_uuid(getattr(event, "id", None))
                if event_id is not None:
                    return event_id, event

        try:
            from_dt = (now_local - timedelta(days=2)).astimezone(timezone.utc)
            to_dt = (now_local + timedelta(days=14)).astimezone(timezone.utc)
            events = await self.event_service.list_events_range(user_id, from_dt, to_dt)
            if len(events) == 1:
                fallback_id = self._parse_uuid(getattr(events[0], "id", None))
                if fallback_id is not None:
                    return fallback_id, events[0]
        except Exception:
            return None, None

        return None, None

    def _derive_update_patch_from_source_message(
        self,
        source_message: str,
        event: Any,
        *,
        now_local: datetime | None,
    ) -> dict[str, Any]:
        patch: dict[str, Any] = {}
        new_title, _target_title = self._extract_rename_details(source_message)
        if new_title:
            patch["title"] = new_title

        base_start = self._parse_iso(getattr(event, "start_at", None))
        base_end = self._parse_iso(getattr(event, "end_at", None))
        if base_start is None:
            return patch
        if base_end is None or base_end <= base_start:
            base_end = base_start + timedelta(hours=1)

        if not hasattr(self.tools, "parse_refinement"):
            return patch

        try:
            refinement = self.tools.parse_refinement(
                source_message,
                base_start_at=base_start,
                base_end_at=base_end,
                now_local=now_local,
            )
        except Exception:
            return patch

        updates = refinement.updates if refinement is not None else {}
        if isinstance(updates, dict):
            for key, value in updates.items():
                patch.setdefault(key, value)
        return patch

    @staticmethod
    def _looks_like_title_question(text: str | None) -> bool:
        lower = str(text or "").lower()
        if not lower:
            return False
        return any(
            marker in lower
            for marker in (
                "какое название",
                "как назвать",
                "название",
                "какой заголовок",
                "what title",
                "which title",
                "new name",
                "rename",
            )
        )

    @staticmethod
    def _merge_source_messages(primary: str, followup: str) -> str:
        first = (primary or "").strip()
        second = (followup or "").strip()
        if not first:
            return second
        if not second:
            return first
        if second in first:
            return first
        return f"{first}\n{second}"

    async def _try_execute_pending_followup(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        pending: dict[str, Any],
        reply_message: str,
        language: str,
        timezone_name: str,
        now_local: datetime,
    ) -> ActionExecutionResult:
        action_type = str(pending.get("action_type") or "").strip()
        payload = pending.get("payload") if isinstance(pending.get("payload"), dict) else {}
        source_message = str(pending.get("source_message") or "").strip()
        merged_source = self._merge_source_messages(source_message, reply_message)

        if action_type == "create_event":
            normalized = self._normalize_create_event_payload(payload)
            normalized["source_message"] = merged_source

            parsed = self.tools.try_parse_task(merged_source, now_local=now_local)
            if parsed is None or not parsed.has_explicit_date:
                parsed = self.tools.try_parse_task(source_message, now_local=now_local) if source_message else None

            if parsed is not None and parsed.has_explicit_date:
                if not str(normalized.get("title") or "").strip():
                    normalized["title"] = parsed.title
                if self._parse_iso(normalized.get("start_at")) is None:
                    normalized["start_at"] = parsed.start_at.isoformat()
                if self._parse_iso(normalized.get("end_at")) is None and parsed.end_at is not None:
                    normalized["end_at"] = parsed.end_at.isoformat()
                if not normalized.get("location_text") and parsed.location_text:
                    normalized["location_text"] = parsed.location_text

            if not str(normalized.get("title") or "").strip():
                title_candidate = self._normalize_pending_title_value(reply_message)
                if title_candidate:
                    normalized["title"] = title_candidate

            action = ProposedAction(
                type="create_event",
                payload=normalized,
                priority=1,
                safety={"needs_confirmation": False, "reason": None},
            )
            return await self._execute_action(
                user_id=user_id,
                action=action,
                language=language,
                timezone_name=timezone_name,
                now_local=now_local,
                session_id=session_id,
            )

        if action_type == "update_event":
            normalized = self._normalize_update_event_payload(payload)
            normalized["source_message"] = merged_source
            patch = normalized.get("patch") if isinstance(normalized.get("patch"), dict) else {}
            if "title" not in patch:
                title_candidate = self._normalize_pending_title_value(reply_message)
                if title_candidate:
                    patch["title"] = title_candidate
            normalized["patch"] = patch

            action = ProposedAction(
                type="update_event",
                payload=normalized,
                priority=1,
                safety={"needs_confirmation": False, "reason": None},
            )
            return await self._execute_action(
                user_id=user_id,
                action=action,
                language=language,
                timezone_name=timezone_name,
                now_local=now_local,
                session_id=session_id,
            )

        return ActionExecutionResult(
            action_type=action_type or "none",
            success=False,
            message="",
            meta="info",
        )

    @staticmethod
    def _enforce_single_question(envelope: AIResultEnvelope) -> AIResultEnvelope:
        question = envelope.clarifying_question
        if question:
            trimmed = question.strip()
            if trimmed.count("?") > 1:
                first = trimmed.split("?", 1)[0].strip()
                envelope.clarifying_question = first + "?"
            elif "?" not in trimmed:
                envelope.clarifying_question = trimmed + "?"
            else:
                envelope.clarifying_question = trimmed

        if envelope.requires_user_input and envelope.clarifying_question is None:
            envelope.clarifying_question = "Could you clarify one detail?"
        return envelope

    async def _log_observations(self, user_id: UUID, envelope: AIResultEnvelope) -> None:
        for item in envelope.observations_to_log:
            try:
                obs_type = ObservationType(item.type)
                impact = ImpactLevel(item.impact)
            except Exception:
                continue
            await self.assistant_repo.create_observation(
                observation_type=obs_type,
                summary=item.summary,
                impact=impact,
                examples_anonymized=item.examples_anonymized,
                user_id=user_id,
            )

    async def _apply_memory_item_to_profile(self, user_id: UUID, item_type: MemoryItemType, key: str, value: Any) -> None:
        if item_type == MemoryItemType.MODE:
            try:
                mode = AssistantMode(str(value))
                await self.assistant_repo.set_default_mode(user_id, mode)
            except Exception:
                return
            return

        if item_type == MemoryItemType.STYLE:
            await self.assistant_repo.set_style_signal(user_id, key, value)
            return

        await self.assistant_repo.set_preference(user_id, key, value)

    async def _store_memory_suggestions(self, user_id: UUID, session_id: UUID, envelope: AIResultEnvelope) -> list[str]:
        prompts: list[str] = []
        pending_ids: list[UUID] = []

        mapping = {
            "preference": MemoryItemType.PREFERENCE,
            "style": MemoryItemType.STYLE,
            "routine": MemoryItemType.ROUTINE,
            "place": MemoryItemType.PLACE,
            "mode": MemoryItemType.MODE,
        }

        for suggestion in envelope.memory_suggestions:
            item_type = mapping.get(suggestion.type)
            if item_type is None:
                continue

            source = MemorySource.EXPLICIT if suggestion.source == "explicit" else MemorySource.INFERRED
            item = await self.assistant_repo.create_semantic_memory_item(
                user_id=user_id,
                item_type=item_type,
                key=suggestion.key,
                value={"value": suggestion.value},
                confidence=suggestion.confidence,
                source=source,
                requires_confirmation=suggestion.requires_confirmation,
                prompt_user=suggestion.prompt_user,
            )

            if suggestion.requires_confirmation:
                pending_ids.append(item.id)
                if suggestion.prompt_user:
                    prompts.append(suggestion.prompt_user)
                continue

            await self._apply_memory_item_to_profile(user_id, item_type, suggestion.key, suggestion.value)
            if suggestion.prompt_user:
                prompts.append(suggestion.prompt_user)

        if pending_ids:
            await self._store_pending_memory_items(session_id, pending_ids)

        return prompts

    async def _handle_memory_confirmation(self, user_id: UUID, session_id: UUID, message: str) -> str | None:
        pending_ids = await self._load_pending_memory_items(session_id)
        if not pending_ids:
            return None
        if not self._is_positive_reply(message) and not self._is_negative_reply(message):
            return None
        language = self._detect_language(message)

        if self._is_negative_reply(message):
            for item_id in pending_ids:
                await self.assistant_repo.reject_memory_item(user_id, item_id)
            await self._clear_pending_memory_items(session_id)
            return "Okay, I will not save this rule." if language == "en" else "Хорошо, не буду сохранять это правило."

        confirmed_count = 0
        for item_id in pending_ids:
            item = await self.assistant_repo.confirm_memory_item(user_id, item_id)
            if item is None:
                continue
            confirmed_count += 1
            value = item.value.get("value") if isinstance(item.value, dict) else item.value
            await self._apply_memory_item_to_profile(user_id, item.item_type, item.key, value)

        await self._clear_pending_memory_items(session_id)
        if confirmed_count == 0:
            return "No pending memory rules to confirm." if language == "en" else "Нет ожидающих правил для подтверждения."
        return (
            f"Saved {confirmed_count} rule(s) to your memory."
            if language == "en"
            else f"Сохранил в память: {confirmed_count}."
        )

    async def _build_fallback_envelope(
        self,
        *,
        request_id: UUID,
        mode: AssistantMode,
        message: str,
        reason: str,
        now_local: datetime,
        actor_role: Literal["user", "admin"] = "user",
    ) -> AIResultEnvelope:
        planner_like = mode == AssistantMode.PLANNER or self.tools.is_in_domain(message)
        language = self._detect_language(message)
        reason_code = self._map_reason_code(reason)
        user_message = self._build_fallback_user_message(
            planner_like=planner_like,
            actor_role=actor_role,
            reason_code=reason_code,
            reason=reason,
            language=language,
        )

        if not planner_like:
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="fallback",
                confidence=0.0,
                reason_code=reason_code,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[],
                options=[],
                planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message=user_message,
            )

        if self._looks_like_list_events_request(message):
            range_value = "tomorrow" if "tomorrow" in message.lower() or "завтра" in message.lower() else "today"
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="fallback",
                confidence=0.4,
                reason_code=reason_code,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    {
                        "type": "list_events",
                        "payload": {"range": range_value, "date_from": None, "date_to": None},
                        "priority": 1,
                        "safety": {"needs_confirmation": False, "reason": None},
                    }
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message=(
                    "Showing schedule via deterministic fallback."
                    if language == "en"
                    else "Показываю расписание в детерминированном fallback-режиме."
                ),
            )

        if self._looks_like_free_slots_request(message):
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="fallback",
                confidence=0.4,
                reason_code=reason_code,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    {
                        "type": "free_slots",
                        "payload": {
                            "date_from": now_local.date().isoformat(),
                            "date_to": (now_local + timedelta(days=2)).date().isoformat(),
                            "duration_minutes": 60,
                            "work_hours_only": True,
                        },
                        "priority": 1,
                        "safety": {"needs_confirmation": False, "reason": None},
                    }
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message=(
                    "Showing free slots via deterministic fallback."
                    if language == "en"
                    else "Показываю свободные слоты в детерминированном fallback-режиме."
                ),
            )

        parsed = self.tools.try_parse_task(message, now_local=now_local)
        if parsed is not None and parsed.has_explicit_date:
            payload = {
                "title": parsed.title,
                "start_at": parsed.start_at.isoformat(),
                "end_at": parsed.end_at.isoformat() if parsed.end_at is not None else None,
                "duration_minutes": None,
                "location_text": parsed.location_text,
                "location_id": None,
                "reminder_offset_minutes": parsed.reminder_offset,
                "flexibility": "unknown",
                "notes": None,
            }
            return AIResultEnvelope(
                request_id=str(request_id),
                mode=mode,
                intent="fallback",
                confidence=0.4,
                reason_code=reason_code,
                requires_user_input=False,
                clarifying_question=None,
                proposed_actions=[
                    {
                        "type": "create_event",
                        "payload": payload,
                        "priority": 1,
                        "safety": {"needs_confirmation": False, "reason": "ai_assistant_unavailable_regex_fallback"},
                    }
                ],
                options=[],
                planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
                memory_suggestions=[],
                observations_to_log=[],
                user_message=user_message,
            )

        return AIResultEnvelope(
            request_id=str(request_id),
            mode=mode,
            intent="fallback",
            confidence=0.0,
            reason_code=reason_code,
            requires_user_input=True,
            clarifying_question=(
                "Please clarify one detail or choose free slots."
                if language == "en"
                else "Уточни один параметр или выбери свободные слоты."
            ),
            proposed_actions=[],
            options=[
                {
                    "id": "opt_1",
                    "label": "Show free slots for next 2 days" if language == "en" else "Показать свободные слоты на 2 дня",
                    "action_type": "free_slots",
                    "payload_patch": {
                        "date_from": now_local.date().isoformat(),
                        "date_to": (now_local + timedelta(days=2)).date().isoformat(),
                        "duration_minutes": 60,
                        "work_hours_only": True,
                    },
                    "impact": {
                        "conflicts_resolved": 0,
                        "travel_risk": "low",
                        "changes_count": 0,
                    },
                }
            ],
            planner_summary={"conflicts": [], "warnings": [reason], "travel_time_notes": []},
            memory_suggestions=[],
            observations_to_log=[],
            user_message=user_message,
        )

    async def _validate_actions(
        self,
        user_id: UUID,
        actions: list[ProposedAction],
        *,
        now_local: datetime | None = None,
    ) -> ValidationResult:
        warnings: list[str] = []
        conflicts: list[dict[str, Any]] = []
        free_slots: list[dict[str, Any]] = []

        user = await self._get_user(user_id)
        mode = getattr(user, "default_route_mode", None)

        for action in actions:
            if action.type not in {"create_event", "update_event"}:
                continue

            payload = action.payload
            normalized_update_payload: dict[str, Any] | None = None
            if action.type == "create_event":
                payload = self._normalize_create_event_payload(payload)
            if action.type == "update_event":
                normalized_update_payload = self._normalize_update_event_payload(payload)
                payload = normalized_update_payload.get("patch", {})

            start_at = self._parse_iso(payload.get("start_at"))
            end_at = self._parse_iso(payload.get("end_at"))
            duration = payload.get("duration_minutes")

            if action.type == "create_event" and start_at is None:
                source_message = str(payload.get("source_message") or "").strip()
                if source_message:
                    parsed = self.tools.try_parse_task(source_message, now_local=now_local)
                    if parsed is not None and parsed.has_explicit_date:
                        start_at = parsed.start_at
                        if end_at is None:
                            end_at = parsed.end_at

            if start_at is None:
                continue

            if end_at is None:
                if isinstance(duration, int) and 1 <= duration <= 24 * 60:
                    end_at = start_at + timedelta(minutes=duration)
                else:
                    end_at = start_at + timedelta(hours=1)

            if end_at <= start_at:
                warnings.append("Invalid time range in proposed action")
                continue

            day_start = start_at - timedelta(hours=12)
            day_end = end_at + timedelta(hours=12)
            existing_events = await self.event_service.list_events_range(user_id, day_start, day_end)

            exclude_event_id = None
            if action.type == "update_event":
                raw_event_id = action.payload.get("event_id")
                if normalized_update_payload is not None:
                    raw_event_id = normalized_update_payload.get("event_id")
                exclude_event_id = self._parse_uuid(raw_event_id)

            overlap = []
            for event in existing_events:
                if exclude_event_id is not None and event.id == exclude_event_id:
                    continue
                if event.start_at < end_at and event.end_at > start_at:
                    overlap.append(event)

            if overlap:
                conflicts.append(
                    {
                        "type": "time_overlap",
                        "count": len(overlap),
                        "events": [{"id": str(item.id), "title": item.title} for item in overlap[:5]],
                    }
                )
                slots = await self.event_service.find_free_slots(
                    user_id=user_id,
                    duration_minutes=max(15, int((end_at - start_at).total_seconds() // 60)),
                    from_dt=start_at,
                    to_dt=start_at + timedelta(days=2),
                )
                free_slots.extend(slots[:4])

            location_lat = payload.get("location_lat")
            location_lon = payload.get("location_lon")
            try:
                lat_val = float(location_lat) if location_lat is not None else None
                lon_val = float(location_lon) if location_lon is not None else None
            except Exception:
                lat_val = None
                lon_val = None

            if lat_val is None or lon_val is None or mode is None:
                continue

            candidate_id = exclude_event_id or uuid4()
            candidate = SimpleNamespace(
                id=candidate_id,
                title=payload.get("title") or "Planned event",
                start_at=start_at,
                end_at=end_at,
                location_lat=lat_val,
                location_lon=lon_val,
            )

            synthetic = [event for event in existing_events if exclude_event_id is None or event.id != exclude_event_id]
            synthetic.append(candidate)
            synthetic = sorted(synthetic, key=lambda item: item.start_at)

            try:
                travel_conflicts = await self.feasibility_service.check(synthetic, mode=mode)
            except Exception:
                travel_conflicts = []

            for item in travel_conflicts[:3]:
                conflicts.append(
                    {
                        "type": "travel_feasibility",
                        "next_event_id": item.next_event_id,
                        "next_event_title": item.next_event_title,
                        "suggested_start_at": item.suggested_start_at,
                        "travel_time_sec": item.travel_time_sec,
                        "reason": item.reason,
                    }
                )

        unique_free_slots: list[dict[str, Any]] = []
        seen = set()
        for slot in free_slots:
            key = (slot.get("start_at"), slot.get("end_at"))
            if key in seen:
                continue
            seen.add(key)
            unique_free_slots.append(slot)

        return ValidationResult(
            conflicts=conflicts,
            free_slots=unique_free_slots[:6],
            warnings=warnings,
        )

    async def _execute_action(
        self,
        user_id: UUID,
        action: ProposedAction,
        *,
        language: str = "ru",
        timezone_name: str = "Europe/Moscow",
        now_local: datetime | None = None,
        session_id: UUID | None = None,
    ) -> ActionExecutionResult:
        if action.safety.needs_confirmation and action.type in {
            "create_event",
            "update_event",
            "delete_event",
            "merge_events",
            "optimize_schedule",
            "set_preference",
        }:
            message = (
                f"Черновое действие ({action.type}) не применено: требуется подтверждение."
                if language == "ru"
                else f"Draft action ({action.type}) was not applied because confirmation is required."
            )
            return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")

        payload = action.payload
        if action.type == "none":
            return ActionExecutionResult(action_type=action.type, success=True, message="", meta="info")

        if action.type == "set_mode":
            raw_mode = payload.get("default_mode") or payload.get("mode")
            try:
                mode = AssistantMode(str(raw_mode))
            except Exception:
                message = "Не удалось определить режим ассистента." if language == "ru" else "Could not parse assistant mode."
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            await self.assistant_repo.set_default_mode(user_id, mode)
            message = (
                f"Ок, режим по умолчанию: {mode.value}."
                if language == "ru"
                else f"Okay, default mode: {mode.value}."
            )
            return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="info")

        if action.type == "set_preference":
            key = str(payload.get("key") or "").strip()
            if not key:
                message = "Нужен ключ настройки." if language == "ru" else "Preference key is required."
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            await self.assistant_repo.set_preference(user_id, key, payload.get("value"))
            message = f"Сохранил настройку: {key}." if language == "ru" else f"Preference saved: {key}."
            return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="info")

        if action.type == "create_event":
            payload = self._normalize_create_event_payload(payload)
            title = str(payload.get("title") or "").strip()
            start_at = self._parse_iso(payload.get("start_at"))
            end_at = self._parse_iso(payload.get("end_at"))
            duration_minutes = payload.get("duration_minutes")

            if not title or start_at is None:
                source_message = str(payload.get("source_message") or "").strip()
                if source_message:
                    parsed = self.tools.try_parse_task(source_message, now_local=now_local)
                    if parsed is not None and parsed.has_explicit_date:
                        if not title:
                            title = parsed.title
                        if start_at is None:
                            start_at = parsed.start_at
                        if end_at is None:
                            end_at = parsed.end_at
                        if not payload.get("location_text") and parsed.location_text:
                            payload["location_text"] = parsed.location_text

            if not title or start_at is None:
                message = (
                    "Не удалось создать событие: обязательны title и start_at."
                    if language == "ru"
                    else "Could not create event: title and start_at are required."
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            if end_at is None:
                if isinstance(duration_minutes, int) and 1 <= duration_minutes <= 24 * 60:
                    end_at = start_at + timedelta(minutes=duration_minutes)
                else:
                    end_at = start_at + timedelta(hours=1)
            if end_at <= start_at:
                message = (
                    "Не удалось создать событие: end_at должен быть позже start_at."
                    if language == "ru"
                    else "Could not create event: end_at must be after start_at."
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            try:
                event = await self.event_service.create_event(
                    user_id=user_id,
                    payload=EventCreate(
                        title=title,
                        start_at=start_at,
                        end_at=end_at,
                        location_text=payload.get("location_text"),
                        location_lat=payload.get("location_lat"),
                        location_lon=payload.get("location_lon"),
                        location_source=EventLocationSource.MANUAL_TEXT,
                        description=payload.get("notes"),
                        status=EventStatus.PLANNED,
                        all_day=False,
                        priority=1,
                    ),
                )
            except Exception as exc:
                logger.exception("create_event action failed", extra={"user_id": str(user_id), "payload": payload})
                message = (
                    f"Не удалось создать событие: {exc}"
                    if language == "ru"
                    else f"Could not create event: {exc}"
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            if session_id is not None:
                await self._store_focus_event(session_id, event)
                await self._clear_pending_title_update(session_id)
            start_label = self._format_local_datetime(event.start_at, timezone_name, language)
            location_text = str(getattr(event, "location_text", "") or "").strip()
            if language == "ru":
                location_suffix = f" Место: {location_text}." if location_text else "."
                message = f"Создал событие \"{event.title}\" в {start_label}{location_suffix}"
            else:
                location_suffix = f" Location: {location_text}." if location_text else "."
                message = f"Created event \"{event.title}\" at {start_label}{location_suffix}"
            return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="create")

        if action.type == "update_event":
            payload = self._normalize_update_event_payload(payload)
            source_message = str(payload.get("source_message") or "").strip()
            local_now = now_local or datetime.now(timezone.utc)

            event_id = self._parse_uuid(payload.get("event_id"))
            event = None
            if event_id is not None:
                try:
                    event = await self.event_service.get_event(user_id, event_id)
                except Exception:
                    event = None

            if event_id is None:
                event_id, event = await self._resolve_update_event_reference(
                    user_id=user_id,
                    session_id=session_id,
                    payload=payload,
                    source_message=source_message,
                    now_local=local_now,
                )
            if event_id is None:
                message = (
                    "Не удалось определить событие для изменения."
                    if language == "ru"
                    else "Could not resolve which event to update."
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")

            patch = payload.get("patch") if isinstance(payload.get("patch"), dict) else {}
            if source_message and event is not None:
                derived_patch = self._derive_update_patch_from_source_message(
                    source_message,
                    event,
                    now_local=local_now,
                )
                for key, value in derived_patch.items():
                    patch.setdefault(key, value)

            update_payload: dict[str, Any] = {}
            for key in ("title", "description", "location_text", "location_lat", "location_lon", "all_day", "priority"):
                if key in patch:
                    update_payload[key] = patch[key]
            start_at = self._parse_iso(patch.get("start_at"))
            end_at = self._parse_iso(patch.get("end_at"))
            if start_at is not None:
                update_payload["start_at"] = start_at
            if end_at is not None:
                update_payload["end_at"] = end_at
            if not update_payload:
                if session_id is not None and source_message and self._is_rename_request(source_message):
                    await self._store_pending_title_update(session_id, event_id)
                    prompt = (
                        f"Какое название вы хотите установить для «{getattr(event, 'title', 'события')}»?"
                        if language == "ru"
                        else f"What title should I set for \"{getattr(event, 'title', 'this event')}\"?"
                    )
                    return ActionExecutionResult(action_type=action.type, success=False, message=prompt, meta="info")
                message = (
                    "Не удалось понять, что именно изменить в событии."
                    if language == "ru"
                    else "Could not determine which fields should be updated."
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            try:
                event = await self.event_service.update_event(user_id, event_id, EventUpdate(**update_payload))
            except Exception as exc:
                logger.exception(
                    "update_event action failed",
                    extra={"user_id": str(user_id), "event_id": str(event_id), "patch_keys": list(update_payload.keys())},
                )
                message = (
                    f"Не удалось изменить событие: {exc}"
                    if language == "ru"
                    else f"Could not update event: {exc}"
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            if session_id is not None:
                await self._store_focus_event(session_id, event)
                await self._clear_pending_title_update(session_id)
            if language == "ru":
                message = f"Изменил событие \"{event.title}\"."
            else:
                message = f"Updated event \"{event.title}\"."
            return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="update")

        if action.type == "delete_event":
            payload = payload if isinstance(payload, dict) else {}
            event_id = self._parse_uuid(payload.get("event_id") or payload.get("id"))
            source_message = str(payload.get("source_message") or "").strip()
            local_now = now_local or datetime.now(timezone.utc)

            if event_id is None:
                resolved_id, _ = await self._resolve_update_event_reference(
                    user_id=user_id,
                    session_id=session_id,
                    payload={"event_id": None},
                    source_message=source_message,
                    now_local=local_now,
                )
                event_id = resolved_id

            if event_id is None:
                message = "Для delete_event нужен event_id." if language == "ru" else "event_id is required for delete_event."
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            try:
                await self.event_service.soft_delete_event(user_id, event_id)
            except Exception as exc:
                logger.exception("delete_event action failed", extra={"user_id": str(user_id), "event_id": str(event_id)})
                message = (
                    f"Не удалось удалить событие: {exc}"
                    if language == "ru"
                    else f"Could not delete event: {exc}"
                )
                return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")
            if session_id is not None:
                focus = await self._load_focus_event(session_id)
                focus_id = self._parse_uuid((focus or {}).get("event_id"))
                if focus_id == event_id:
                    await self._clear_focus_event(session_id)
                    await self._clear_pending_title_update(session_id)
            message = "Удалил событие." if language == "ru" else "Deleted event."
            return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="delete")

        if action.type == "list_events":
            payload_range = str(payload.get("range") or "today").lower()
            tz = self._safe_zoneinfo(timezone_name)
            local_now = now_local.astimezone(tz) if now_local is not None else datetime.now(tz)
            if payload_range == "tomorrow":
                base_day = local_now.date() + timedelta(days=1)
                from_dt = datetime(base_day.year, base_day.month, base_day.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
                to_dt = datetime(base_day.year, base_day.month, base_day.day, 23, 59, 59, tzinfo=tz).astimezone(timezone.utc)
            elif payload_range == "week":
                start_day = local_now.date()
                end_day = start_day + timedelta(days=7)
                from_dt = datetime(start_day.year, start_day.month, start_day.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
                to_dt = datetime(end_day.year, end_day.month, end_day.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
            elif payload_range == "custom":
                from_dt = self._parse_iso(payload.get("date_from")) or local_now.astimezone(timezone.utc)
                to_dt = self._parse_iso(payload.get("date_to")) or (from_dt + timedelta(days=1))
            else:
                base_day = local_now.date()
                from_dt = datetime(base_day.year, base_day.month, base_day.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
                to_dt = datetime(base_day.year, base_day.month, base_day.day, 23, 59, 59, tzinfo=tz).astimezone(timezone.utc)
            events = await self.event_service.list_events_range(user_id, from_dt, to_dt)
            if not events:
                message = "В выбранном периоде событий нет." if language == "ru" else "No events found in the selected range."
                return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="info")
            if session_id is not None and len(events) == 1:
                await self._store_focus_event(session_id, events[0])
            lines = ["События:"] if language == "ru" else ["Events:"]
            for item in events[:10]:
                start_label = self._format_local_datetime(item.start_at, timezone_name, language)
                lines.append(f"- {start_label} {item.title}")
            return ActionExecutionResult(action_type=action.type, success=True, message="\n".join(lines), meta="info")

        if action.type == "free_slots":
            tz = self._safe_zoneinfo(timezone_name)
            local_now = now_local.astimezone(tz) if now_local is not None else datetime.now(tz)

            raw_date_from = payload.get("date_from")
            raw_date_to = payload.get("date_to")
            date_from = self._parse_iso(raw_date_from)
            date_to = self._parse_iso(raw_date_to)

            if isinstance(raw_date_from, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date_from.strip()):
                parsed_day = datetime.fromisoformat(raw_date_from.strip())
                date_from = datetime(parsed_day.year, parsed_day.month, parsed_day.day, 0, 0, tzinfo=tz).astimezone(timezone.utc)
            if isinstance(raw_date_to, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date_to.strip()):
                parsed_day = datetime.fromisoformat(raw_date_to.strip())
                date_to = datetime(parsed_day.year, parsed_day.month, parsed_day.day, 23, 59, 59, tzinfo=tz).astimezone(timezone.utc)

            if date_from is None:
                date_from = local_now.astimezone(timezone.utc)
            if date_to is None or date_to <= date_from:
                date_to = date_from + timedelta(days=2)
            duration = payload.get("duration_minutes")
            duration_minutes = int(duration) if isinstance(duration, int) else 60
            duration_minutes = max(15, min(480, duration_minutes))
            slots = await self.event_service.find_free_slots(
                user_id=user_id,
                duration_minutes=duration_minutes,
                from_dt=date_from,
                to_dt=date_to,
                work_start_hour=9,
                work_end_hour=19,
            )
            if not slots:
                message = "Свободных слотов не найдено." if language == "ru" else "No free slots found."
                return ActionExecutionResult(action_type=action.type, success=True, message=message, meta="info")
            lines = ["Свободные слоты:"] if language == "ru" else ["Free slots:"]
            for item in slots[:6]:
                start_at = self._parse_iso(item.get("start_at"))
                end_at = self._parse_iso(item.get("end_at"))
                if start_at and end_at:
                    start_label = self._format_local_datetime(start_at, timezone_name, language)
                    end_local = self._to_user_local(end_at, timezone_name)
                    end_label = end_local.strftime("%H:%M")
                    lines.append(f"- {start_label} - {end_label}")
                else:
                    lines.append(f"- {item.get('start_at')} .. {item.get('end_at')}")
            return ActionExecutionResult(action_type=action.type, success=True, message="\n".join(lines), meta="info")

        if action.type in {"merge_events", "optimize_schedule"}:
            message = (
                f"{action.type} сейчас доступен как черновик и требует выбора варианта."
                if language == "ru"
                else f"{action.type} is currently available as a draft and requires option selection."
            )
            return ActionExecutionResult(
                action_type=action.type,
                success=False,
                message=message,
                meta="info",
            )

        message = f"Неподдерживаемое действие: {action.type}" if language == "ru" else f"Unsupported action: {action.type}"
        return ActionExecutionResult(action_type=action.type, success=False, message=message, meta="info")

    async def _execute_actions(
        self,
        user_id: UUID,
        actions: list[ProposedAction],
        *,
        language: str,
        timezone_name: str,
        now_local: datetime,
        session_id: UUID | None = None,
    ) -> list[ActionExecutionResult]:
        ordered = sorted(actions, key=lambda item: item.priority)
        results: list[ActionExecutionResult] = []
        for action in ordered:
            results.append(
                await self._execute_action(
                    user_id,
                    action,
                    language=language,
                    timezone_name=timezone_name,
                    now_local=now_local,
                    session_id=session_id,
                )
            )
        return results

    async def _apply_option(
        self,
        user_id: UUID,
        session_id: UUID,
        option: ProposedOption,
        *,
        language: str,
        timezone_name: str,
        now_local: datetime,
    ) -> ActionExecutionResult:
        action = ProposedAction(
            type=option.action_type,
            payload=option.payload_patch,
            priority=1,
            safety={"needs_confirmation": False, "reason": None},
        )
        result = await self._execute_action(
            user_id,
            action,
            language=language,
            timezone_name=timezone_name,
            now_local=now_local,
            session_id=session_id,
        )
        await self._clear_pending_options(session_id)
        return result

    @staticmethod
    def _format_requires_input(envelope: AIResultEnvelope) -> str:
        base = envelope.clarifying_question or envelope.user_message or "Please clarify one detail."
        if envelope.options:
            return base
        return base

    @staticmethod
    def _compose_action_message(base_message: str, results: list[ActionExecutionResult]) -> str:
        successful = [item.message for item in results if item.success and item.message]
        failed = [item.message for item in results if not item.success and item.message]

        # Execution outcome from deterministic backend logic is the source of truth.
        # Do not mix optimistic model text with failed actions.
        if successful and failed:
            return "\n".join([*successful, *failed])
        if successful:
            return "\n".join(successful)
        if failed:
            return "\n".join(failed)
        return base_message or "Ready."

    @staticmethod
    def _resolve_response_meta(results: list[ActionExecutionResult]) -> Literal["create", "update", "delete", "info"]:
        for item in results:
            if item.success and item.meta in {"create", "update", "delete"}:
                return item.meta
        return "info"

    async def _store_assistant_message(
        self,
        session_id: UUID,
        content: str,
        *,
        provider: str = "assistant",
        model: str = "assistant-v2",
        meta: str = "info",
    ) -> None:
        await self.repo.create_message(
            session_id=session_id,
            role=AIRole.ASSISTANT,
            content=self._with_meta(meta, content),
            provider=provider,
            model=model,
            tokens_in=0,
            tokens_out=0,
        )

    async def chat(
        self,
        user_id: UUID,
        message: str,
        session_id: UUID | None,
        chat_type: AIChatType | None = None,
        selected_option_id: str | None = None,
        actor_role: Literal["user", "admin"] = "user",
    ) -> ChatResult:
        profile = await self.assistant_repo.get_or_create_profile_memory(user_id)
        mode_override, clean_message = self._extract_mode_override(message)
        user = await self._get_user(user_id)
        timezone_name, now_local = UserTimezoneService.now_local(user)
        request_language = self._detect_language(clean_message or message)
        effective_mode = mode_override or profile.default_mode
        target_chat_type = chat_type or self._mode_to_chat_type(effective_mode, clean_message, self.tools)
        ai_session = await self._resolve_session_for_chat_type(
            user_id=user_id,
            requested_session_id=session_id,
            target_chat_type=target_chat_type,
        )

        await self.repo.create_message(
            session_id=ai_session.id,
            role=AIRole.USER,
            content=message,
            provider="client",
            model="input",
        )

        memory_confirmation = await self._handle_memory_confirmation(user_id, ai_session.id, message)
        if memory_confirmation is not None:
            await self._store_assistant_message(ai_session.id, memory_confirmation)
            await self._save_conversation_summary(user_id, ai_session.id)
            await self.session.commit()
            return ChatResult(
                session_id=ai_session.id,
                chat_type=ai_session.chat_type,
                display_index=ai_session.display_index,
                answer=memory_confirmation,
            )

        pending_options = await self._load_pending_options(ai_session.id)
        selected_option: ProposedOption | None = None
        if pending_options:
            if selected_option_id:
                selected_option = next((item for item in pending_options if item.id == selected_option_id), None)
            else:
                choice = self._extract_number_choice(message)
                if choice is not None and 1 <= choice <= len(pending_options):
                    selected_option = pending_options[choice - 1]

        if selected_option is not None:
            option_result = await self._apply_option(
                user_id,
                ai_session.id,
                selected_option,
                language=request_language,
                timezone_name=timezone_name,
                now_local=now_local,
            )
            answer = option_result.message or ("Вариант применён." if request_language == "ru" else "Option applied.")
            await self._clear_pending_title_update(ai_session.id)
            await self._clear_pending_followup(ai_session.id)
            await self._store_assistant_message(ai_session.id, answer, meta=option_result.meta)
            await self._save_conversation_summary(user_id, ai_session.id)
            await self.session.commit()
            return ChatResult(
                session_id=ai_session.id,
                chat_type=ai_session.chat_type,
                display_index=ai_session.display_index,
                answer=answer,
                response_meta=option_result.meta,
            )

        pending_title_event_id = await self._load_pending_title_update(ai_session.id)
        if pending_title_event_id is not None:
            if self._is_negative_reply(clean_message):
                await self._clear_pending_title_update(ai_session.id)
                cancel_message = (
                    "Хорошо, оставляю название без изменений."
                    if request_language == "ru"
                    else "Okay, keeping the title unchanged."
                )
                await self._store_assistant_message(ai_session.id, cancel_message, meta="info")
                await self._save_conversation_summary(user_id, ai_session.id)
                await self.session.commit()
                return ChatResult(
                    session_id=ai_session.id,
                    chat_type=ai_session.chat_type,
                    display_index=ai_session.display_index,
                    answer=cancel_message,
                    response_meta="info",
                )

            title_candidate = self._normalize_pending_title_value(clean_message)
            if title_candidate is not None:
                pending_result = await self._execute_action(
                    user_id=user_id,
                    action=ProposedAction(
                        type="update_event",
                        payload={
                            "event_id": str(pending_title_event_id),
                            "patch": {"title": title_candidate},
                            "source_message": clean_message,
                        },
                        priority=1,
                        safety={"needs_confirmation": False, "reason": None},
                    ),
                    language=request_language,
                    timezone_name=timezone_name,
                    now_local=now_local,
                    session_id=ai_session.id,
                )
                await self._clear_pending_title_update(ai_session.id)
                await self._clear_pending_followup(ai_session.id)
                answer = pending_result.message or (
                    "Изменил название события." if request_language == "ru" else "Updated event title."
                )
                await self._store_assistant_message(ai_session.id, answer, meta=pending_result.meta)
                await self._save_conversation_summary(user_id, ai_session.id)
                await self.session.commit()
                return ChatResult(
                    session_id=ai_session.id,
                    chat_type=ai_session.chat_type,
                    display_index=ai_session.display_index,
                    answer=answer,
                    response_meta=pending_result.meta,
                )

        pending_followup = await self._load_pending_followup(ai_session.id)
        if pending_followup is not None:
            if self._is_negative_reply(clean_message):
                await self._clear_pending_followup(ai_session.id)
                cancel_message = (
                    "Хорошо, не буду применять это изменение."
                    if request_language == "ru"
                    else "Okay, I will not apply this change."
                )
                await self._store_assistant_message(ai_session.id, cancel_message, meta="info")
                await self._save_conversation_summary(user_id, ai_session.id)
                await self.session.commit()
                return ChatResult(
                    session_id=ai_session.id,
                    chat_type=ai_session.chat_type,
                    display_index=ai_session.display_index,
                    answer=cancel_message,
                    response_meta="info",
                )

            followup_result = await self._try_execute_pending_followup(
                user_id=user_id,
                session_id=ai_session.id,
                pending=pending_followup,
                reply_message=clean_message,
                language=request_language,
                timezone_name=timezone_name,
                now_local=now_local,
            )
            await self._clear_pending_followup(ai_session.id)
            answer = followup_result.message or (
                "Не удалось применить уточнение."
                if request_language == "ru"
                else "Could not apply the follow-up details."
            )
            await self._store_assistant_message(ai_session.id, answer, meta=followup_result.meta)
            await self._save_conversation_summary(user_id, ai_session.id)
            await self.session.commit()
            return ChatResult(
                session_id=ai_session.id,
                chat_type=ai_session.chat_type,
                display_index=ai_session.display_index,
                answer=answer,
                response_meta=followup_result.meta,
            )

        request_id = uuid4()
        deterministic_interpreted = self._try_deterministic_planner_envelope(
            request_id=request_id,
            mode=effective_mode,
            message=clean_message,
            target_chat_type=target_chat_type,
            now_local=now_local,
        )
        used_deterministic_path = deterministic_interpreted is not None

        if deterministic_interpreted is not None:
            interpreted = deterministic_interpreted
        else:
            context_pack = await self._build_context_pack(user_id, ai_session.id)
            assistant_available = await self.assistant_client.is_healthy()
            if not assistant_available:
                logger.warning("ai-assistant is unhealthy, falling back", extra={"request_id": str(request_id), "user_id": str(user_id)})
                interpreted = await self._build_fallback_envelope(
                    request_id=request_id,
                    mode=effective_mode,
                    message=clean_message,
                    reason="backend_unavailable:ai_assistant_healthcheck_failed",
                    now_local=now_local,
                    actor_role=actor_role,
                )
            else:
                try:
                    interpreted = await self.assistant_client.interpret(
                        AIInterpretRequest(
                            request_id=request_id,
                            user_id=user_id,
                            session_id=ai_session.id,
                            mode=effective_mode,
                            actor_role=actor_role,
                            message=clean_message,
                            context_pack=context_pack,
                            backend_available=True,
                        )
                    )
                except AssistantClientError as exc:
                    logger.warning(
                        "ai-assistant interpret failed, switching to fallback",
                        extra={"request_id": str(request_id), "user_id": str(user_id), "error": str(exc)},
                    )
                    interpreted = await self._build_fallback_envelope(
                        request_id=request_id,
                        mode=effective_mode,
                        message=clean_message,
                        reason=str(exc),
                        now_local=now_local,
                        actor_role=actor_role,
                    )

        interpreted.proposed_actions = self._attach_source_message_to_actions(interpreted.proposed_actions, clean_message)

        backend_available = True
        try:
            validation = await self._validate_actions(user_id, interpreted.proposed_actions, now_local=now_local)
        except Exception as exc:
            logger.exception(
                "validation failed, using degraded backend_available=false",
                extra={"request_id": str(request_id), "user_id": str(user_id)},
            )
            backend_available = False
            validation = ValidationResult(
                conflicts=[],
                free_slots=[],
                warnings=[f"backend_validation_unavailable:{exc}"],
            )

        if used_deterministic_path:
            proposed = interpreted
        else:
            try:
                proposed = await self.assistant_client.propose(
                    AIProposeRequest(
                        request_id=request_id,
                        interpreted=interpreted,
                        validation=validation,
                        backend_available=backend_available,
                    )
                )
            except AssistantClientError as exc:
                logger.warning(
                    "ai-assistant propose failed, using interpreted envelope",
                    extra={"request_id": str(request_id), "user_id": str(user_id), "error": str(exc)},
                )
                proposed = interpreted
                proposed.intent = "fallback"
                proposed.reason_code = self._map_reason_code(str(exc))
                proposed.planner_summary.warnings.append(str(exc))

        envelope = self._enforce_single_question(proposed)

        await self._log_observations(user_id, envelope)
        memory_prompts = await self._store_memory_suggestions(user_id, ai_session.id, envelope)

        answer: str
        response_meta: Literal["create", "update", "delete", "info"] = "info"
        options_payload: list[dict[str, Any]] = []
        if envelope.requires_user_input:
            if envelope.options:
                await self._store_pending_options(ai_session.id, envelope.options)
                options_payload = [item.model_dump(mode="json") for item in envelope.options]
            else:
                await self._clear_pending_options(ai_session.id)

            followup_action = next(
                (
                    item
                    for item in envelope.proposed_actions
                    if item.type in {"create_event", "update_event"}
                ),
                None,
            )
            if followup_action is not None:
                followup_source = str(followup_action.payload.get("source_message") or "").strip() or clean_message
                await self._store_pending_followup(
                    ai_session.id,
                    action_type=followup_action.type,
                    payload=followup_action.payload,
                    source_message=followup_source,
                )
            elif envelope.intent in {"create_event", "update_event"}:
                await self._store_pending_followup(
                    ai_session.id,
                    action_type=envelope.intent,
                    payload={},
                    source_message=clean_message,
                )
            elif target_chat_type == AIChatType.PLANNER:
                fallback_intent = self.tools.detect_intent(clean_message)
                if fallback_intent in {"create_event", "update_event"}:
                    await self._store_pending_followup(
                        ai_session.id,
                        action_type=fallback_intent,
                        payload={},
                        source_message=clean_message,
                    )
                else:
                    await self._clear_pending_followup(ai_session.id)
            else:
                await self._clear_pending_followup(ai_session.id)

            if (
                envelope.intent == "update_event"
                and self._looks_like_title_question(envelope.clarifying_question or envelope.user_message)
            ):
                focus = await self._load_focus_event(ai_session.id)
                focus_id = self._parse_uuid((focus or {}).get("event_id"))
                if focus_id is not None:
                    await self._store_pending_title_update(ai_session.id, focus_id)
            answer = self._format_requires_input(envelope)
        else:
            await self._clear_pending_options(ai_session.id)
            await self._clear_pending_title_update(ai_session.id)
            await self._clear_pending_followup(ai_session.id)
            execution_actions = self._attach_source_message_to_actions(envelope.proposed_actions, clean_message)
            execution_results = await self._execute_actions(
                user_id,
                execution_actions,
                language=request_language,
                timezone_name=timezone_name,
                now_local=now_local,
                session_id=ai_session.id,
            )
            answer = self._compose_action_message(envelope.user_message, execution_results)
            response_meta = self._resolve_response_meta(execution_results)

        if memory_prompts:
            answer = f"{answer}\n\n" + "\n".join(memory_prompts[:1])

        await self._store_assistant_message(
            ai_session.id,
            answer,
            provider="ai-assistant",
            model="assistant-v2",
            meta=response_meta if not envelope.requires_user_input else "info",
        )

        await self._save_conversation_summary(user_id, ai_session.id)
        await self.session.commit()

        return ChatResult(
            session_id=ai_session.id,
            chat_type=ai_session.chat_type,
            display_index=ai_session.display_index,
            answer=answer,
            mode=envelope.mode,
            intent=envelope.intent,
            fallback_reason_code=envelope.reason_code,
            requires_user_input=envelope.requires_user_input,
            clarifying_question=envelope.clarifying_question,
            options=options_payload,
            memory_suggestions=[item.model_dump(mode="json") for item in envelope.memory_suggestions],
            planner_summary=envelope.planner_summary.model_dump(mode="json"),
            response_meta=response_meta if not envelope.requires_user_input else "info",
        )

    async def stream_chat(
        self,
        user_id: UUID,
        message: str,
        session_id: UUID | None,
        chat_type: AIChatType | None = None,
        selected_option_id: str | None = None,
        actor_role: Literal["user", "admin"] = "user",
    ):
        result = await self.chat(
            user_id=user_id,
            message=message,
            session_id=session_id,
            chat_type=chat_type,
            selected_option_id=selected_option_id,
            actor_role=actor_role,
        )
        words = result.answer.split(" ")
        for idx, word in enumerate(words, start=1):
            payload = {"index": idx, "token": word, "session_id": str(result.session_id)}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.02)
        yield "event: done\ndata: {\"done\": true}\n\n"

    async def ingest_task(self, user_id: UUID, source: str, payload_ref: str, text: str):
        payload = {"ref": payload_ref, "text": text}
        job = await self.repo.create_job(user_id=user_id, source=source, payload_ref=json.dumps(payload, ensure_ascii=False))
        await self.redis.rpush("ai:jobs", str(job.id))
        await self.session.commit()
        return job

    async def process_job(self, job_id: UUID):
        job = await self.repo.get_job(job_id)
        if job is None:
            return
        await self.repo.set_job_status(job, AITaskStatus.PROCESSING)
        await self.session.commit()
        try:
            payload = json.loads(job.payload_ref)
            parsed = self.tools.try_parse_task(payload.get("text", ""))
            if parsed is None or not parsed.has_explicit_date:
                result_payload = {"message": "No task extracted"}
            else:
                event = await self.event_service.create_event(
                    job.user_id,
                    EventCreate(
                        title=parsed.title,
                        description="Created by AI assistant",
                        location_text=parsed.location_text if parsed.has_explicit_location else None,
                        start_at=parsed.start_at,
                        end_at=parsed.end_at,
                        all_day=not parsed.has_explicit_time,
                        status=EventStatus.PLANNED,
                        priority=1,
                    ),
                )
                result_payload = {
                    "event_id": str(event.id),
                    "title": event.title,
                    "has_explicit_time": parsed.has_explicit_time,
                    "has_explicit_location": parsed.has_explicit_location,
                    "has_explicit_date": parsed.has_explicit_date,
                }
            await self.repo.set_job_status(job, AITaskStatus.COMPLETED, result_payload=result_payload)
            await self.session.commit()
        except Exception as exc:
            logger.exception("process_job failed", extra={"job_id": str(job_id)})
            await self.repo.set_job_status(job, AITaskStatus.FAILED, error=str(exc))
            await self.session.commit()

    async def transcribe_voice(self, audio_bytes: bytes, filename: str) -> str:
        for _, provider in self.providers.items():
            try:
                text = await provider.transcribe(audio_bytes, filename)
                if text and text.strip():
                    return text.strip()
            except Exception:
                continue
        return ""

    async def get_mode_state(self, user_id: UUID, *, ensure_active: bool = False):
        profile = await self.assistant_repo.get_or_create_profile_memory(user_id)
        mode = profile.default_mode
        target_chat_type = self._chat_type_for_mode(mode)
        if target_chat_type is None:
            return mode, None

        if ensure_active:
            session = await self._get_or_create_session_by_type(user_id, target_chat_type)
            await self.session.commit()
            return mode, session

        session = await self.repo.get_latest_session_by_type(user_id, target_chat_type)
        return mode, session

    async def get_default_mode(self, user_id: UUID) -> AssistantMode:
        mode, _ = await self.get_mode_state(user_id, ensure_active=False)
        return mode

    async def set_default_mode(
        self,
        user_id: UUID,
        mode: AssistantMode,
        *,
        session_id: UUID | None = None,
        create_new_chat: bool = False,
    ):
        active_session = None
        target_chat_type = self._chat_type_for_mode(mode)
        if target_chat_type is not None:
            if session_id is None:
                active_session = await self._get_or_create_session_by_type(user_id, target_chat_type)
            else:
                current_session = await self.repo.get_session(user_id, session_id)
                if current_session is None:
                    raise NotFoundError("AI session not found")

                if current_session.chat_type == target_chat_type:
                    active_session = current_session
                else:
                    session_empty = await self.repo.is_session_empty(user_id, current_session.id)
                    if session_empty:
                        active_session = await self.repo.update_session_chat_type(current_session, target_chat_type)
                    else:
                        if not create_new_chat:
                            raise ConflictError(
                                "Cannot switch mode for non-empty chat. Create a new chat.",
                                details={
                                    "reason": "non_empty_chat",
                                    "target_chat_type": target_chat_type.value,
                                },
                            )
                        else:
                            active_session = await self.repo.create_session(user_id, target_chat_type)

        await self.assistant_repo.set_default_mode(user_id, mode)
        await self.session.commit()
        return mode, active_session

    async def create_session(self, user_id: UUID, chat_type: AIChatType | None = None):
        if chat_type is None:
            profile = await self.assistant_repo.get_or_create_profile_memory(user_id)
            chat_type = self._mode_to_chat_type(profile.default_mode, "", self.tools)
        session_obj = await self.repo.create_session(user_id, chat_type)
        await self.session.commit()
        return session_obj

    async def delete_session(self, user_id: UUID, session_id: UUID):
        deleted = await self.repo.soft_delete_session(user_id, session_id)
        if deleted is None:
            raise NotFoundError("AI session not found")
        await self.session.commit()
        return deleted

    async def list_sessions(self, user_id: UUID):
        return await self.repo.list_sessions(user_id)

    async def list_messages(self, user_id: UUID, session_id: UUID):
        return await self.repo.list_messages(user_id, session_id)








