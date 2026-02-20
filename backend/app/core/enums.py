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
