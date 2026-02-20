from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import AssistantMode

ActionType = Literal[
    "create_event",
    "update_event",
    "delete_event",
    "merge_events",
    "list_events",
    "free_slots",
    "optimize_schedule",
    "set_mode",
    "set_preference",
    "none",
]

MemorySuggestionType = Literal["preference", "style", "routine", "place", "mode"]
MemorySuggestionSource = Literal["explicit", "inferred"]
ObservationLogType = Literal["gap_request", "failure_case", "feature_demand", "misunderstanding", "new_intent"]
ImpactType = Literal["low", "med", "high"]
TravelRiskType = Literal["low", "med", "high"]
ReasonCodeType = Literal["provider_error", "timeout", "rate_limit", "backend_unavailable", "unknown"]


class AIChatWindowMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)

    model_config = {"extra": "forbid"}


class ContextPack(BaseModel):
    user_profile_summary: str | None = None
    conversation_summary: str | None = None
    last_messages_window: list[AIChatWindowMessage] = Field(default_factory=list)
    relevant_memory_items: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class ActionSafety(BaseModel):
    needs_confirmation: bool = False
    reason: str | None = None

    model_config = {"extra": "forbid"}


class ProposedAction(BaseModel):
    type: ActionType
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=1, ge=1)
    safety: ActionSafety = Field(default_factory=ActionSafety)

    model_config = {"extra": "forbid"}


class OptionImpact(BaseModel):
    conflicts_resolved: int = Field(default=0, ge=0)
    travel_risk: TravelRiskType = "med"
    changes_count: int = Field(default=0, ge=0)

    model_config = {"extra": "forbid"}


class ProposedOption(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    action_type: ActionType
    payload_patch: dict[str, Any] = Field(default_factory=dict)
    impact: OptionImpact = Field(default_factory=OptionImpact)

    model_config = {"extra": "forbid"}


class PlannerSummary(BaseModel):
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    travel_time_notes: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class MemorySuggestion(BaseModel):
    type: MemorySuggestionType
    key: str = Field(min_length=1)
    value: Any
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: MemorySuggestionSource
    requires_confirmation: bool = True
    prompt_user: str | None = None

    model_config = {"extra": "forbid"}


class ObservationLog(BaseModel):
    type: ObservationLogType
    summary: str = Field(min_length=1)
    examples_anonymized: list[str] = Field(default_factory=list)
    impact: ImpactType = "low"

    model_config = {"extra": "forbid"}


class AIResultEnvelope(BaseModel):
    request_id: str
    mode: AssistantMode
    intent: str = Field(min_length=1)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reason_code: ReasonCodeType | None = None
    requires_user_input: bool = False
    clarifying_question: str | None = None
    proposed_actions: list[ProposedAction] = Field(default_factory=list)
    options: list[ProposedOption] = Field(default_factory=list)
    planner_summary: PlannerSummary = Field(default_factory=PlannerSummary)
    memory_suggestions: list[MemorySuggestion] = Field(default_factory=list)
    observations_to_log: list[ObservationLog] = Field(default_factory=list)
    user_message: str = ""

    model_config = {"extra": "forbid"}


class AIInterpretRequest(BaseModel):
    request_id: UUID
    user_id: UUID
    session_id: UUID | None = None
    mode: AssistantMode
    actor_role: Literal["user", "admin"] = "user"
    message: str = Field(min_length=1, max_length=8000)
    context_pack: ContextPack = Field(default_factory=ContextPack)
    backend_available: bool = True

    model_config = {"extra": "forbid"}


class ValidationResult(BaseModel):
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    free_slots: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AIProposeRequest(BaseModel):
    request_id: UUID
    interpreted: AIResultEnvelope
    validation: ValidationResult = Field(default_factory=ValidationResult)
    backend_available: bool = True

    model_config = {"extra": "forbid"}


class KBPatchApproveRequest(BaseModel):
    patch_id: UUID
    reviewer_user_id: UUID | None = None

    model_config = {"extra": "forbid"}


class KBPatchRejectRequest(BaseModel):
    patch_id: UUID
    reason: str = Field(min_length=1, max_length=1000)
    reviewer_user_id: UUID | None = None

    model_config = {"extra": "forbid"}
