from enum import Enum


class EventStatus(str, Enum):
    PLANNED = "planned"
    DONE = "done"
    CANCELED = "canceled"


class ReminderStatus(str, Enum):
    SCHEDULED = "scheduled"
    SENT = "sent"
    FAILED = "failed"
    CANCELED = "canceled"


class ReminderType(str, Enum):
    TELEGRAM = "telegram"


class EventLocationSource(str, Enum):
    MANUAL_TEXT = "manual_text"
    GEOCODED = "geocoded"
    MAP_PICK = "map_pick"


class RouteMode(str, Enum):
    WALKING = "walking"
    DRIVING = "driving"
    PUBLIC_TRANSPORT = "public_transport"
    BICYCLE = "bicycle"


class MapProvider(str, Enum):
    LEAFLET = "leaflet"
    YANDEX = "yandex"


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class FeedItemType(str, Enum):
    NOTIFICATION = "notification"
    UPDATE = "update"
    REMINDER = "reminder"


class AssistantMode(str, Enum):
    AUTO = "AUTO"
    PLANNER = "PLANNER"
    COMPANION = "COMPANION"


class AIChatType(str, Enum):
    PLANNER = "planner"
    COMPANION = "companion"


class MemorySource(str, Enum):
    EXPLICIT = "explicit"
    INFERRED = "inferred"


class MemoryItemType(str, Enum):
    PREFERENCE = "preference"
    STYLE = "style"
    ROUTINE = "routine"
    PLACE = "place"
    MODE = "mode"


class KnowledgeStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class ObservationType(str, Enum):
    GAP_REQUEST = "gap_request"
    FAILURE_CASE = "failure_case"
    FEATURE_DEMAND = "feature_demand"
    MISUNDERSTANDING = "misunderstanding"
    NEW_INTENT = "new_intent"


class ImpactLevel(str, Enum):
    LOW = "low"
    MED = "med"
    HIGH = "high"


class KBPatchStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AIRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class AITaskSource(str, Enum):
    WEB_TEXT = "web_text"
    TG_TEXT = "tg_text"
    WEB_VOICE = "web_voice"
    TG_VOICE = "tg_voice"


class AITaskStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
