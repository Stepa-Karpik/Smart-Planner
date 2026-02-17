from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from app.core.enums import EventStatus
from app.schemas.event import EventCreate
from app.services.events import EventService

AIIntent = Literal[
    "create_event",
    "list_tomorrow",
    "weekly_overview",
    "free_slots",
    "optimize_schedule",
    "travel_time",
    "schedule_query",
    "general",
]


@dataclass(slots=True)
class ParsedTask:
    title: str
    start_at: datetime
    end_at: datetime | None
    location_text: str | None
    reminder_offset: int | None
    has_explicit_date: bool
    has_explicit_time: bool
    has_coarse_time_hint: bool
    has_explicit_location: bool
    location_requires_clarification: bool
    title_is_generic: bool


@dataclass(slots=True)
class RefinementParse:
    updates: dict
    has_explicit_time: bool
    has_coarse_time_hint: bool
    has_explicit_location: bool
    has_explicit_date: bool


class AITools:
    _HOUR_CARDINAL: dict[str, int] = {
        "ноль": 0,
        "один": 1,
        "одна": 1,
        "час": 1,
        "два": 2,
        "две": 2,
        "три": 3,
        "четыре": 4,
        "пять": 5,
        "шесть": 6,
        "семь": 7,
        "восемь": 8,
        "девять": 9,
        "десять": 10,
        "одиннадцать": 11,
        "двенадцать": 12,
    }
    _HOUR_GENITIVE: dict[str, int] = {
        "первого": 1,
        "второго": 2,
        "третьего": 3,
        "четвертого": 4,
        "четвёртого": 4,
        "пятого": 5,
        "шестого": 6,
        "седьмого": 7,
        "восьмого": 8,
        "девятого": 9,
        "десятого": 10,
        "одиннадцатого": 11,
        "двенадцатого": 12,
    }
    _MINUTE_WORDS: dict[str, int] = {
        "одной": 1,
        "двух": 2,
        "трех": 3,
        "трёх": 3,
        "четырех": 4,
        "четырёх": 4,
        "пяти": 5,
        "десяти": 10,
        "пятнадцати": 15,
        "четверти": 15,
        "двадцати": 20,
        "двадцати пяти": 25,
        "тридцати": 30,
    }

    def __init__(self, event_service: EventService) -> None:
        self.event_service = event_service

    @staticmethod
    def _normalize_text_for_parsing(text: str) -> str:
        normalized = re.sub(r"\s+", " ", text.strip())
        normalized = re.sub(r"\bсеголня\b", "сегодня", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\bсегодя\b", "сегодня", normalized, flags=re.IGNORECASE)
        return normalized

    @staticmethod
    def detect_intent(text: str) -> AIIntent:
        lower = AITools._normalize_text_for_parsing(text).lower()

        if any(token in lower for token in ("время в пути", "маршрут", "как добраться", "от ", " до ")) and any(
            token in lower for token in ("рассч", "посч", "сколько", "в пути", "route", "travel")
        ):
            return "travel_time"

        if any(token in lower for token in ("что у меня завтра", "планы на завтра", "что завтра")):
            return "list_tomorrow"

        if any(token in lower for token in ("на неделе", "на неделю", "по встречам", "weekly", "this week")):
            if any(marker in lower for marker in ("оптим", "свобод", "optimiz", "free time", "more free")):
                return "optimize_schedule"
            return "weekly_overview"

        if any(token in lower for token in ("свободное окно", "свободные окна", "когда свобод", "free slot", "free time slot")):
            return "free_slots"

        if any(token in lower for token in ("оптим", "rearrange", "optimiz")) and any(
            token in lower for token in ("расписан", "календар", "schedule", "calendar", "время")
        ):
            return "optimize_schedule"

        create_verbs = (
            "добав",
            "созда",
            "заплан",
            "внес",
            "постав",
            "назнач",
            "напомни",
            "добавь",
            "add",
            "create",
            "schedule",
        )
        has_create_verb = any(verb in lower for verb in create_verbs)
        has_question = "?" in lower or lower.startswith(
            ("что ", "когда ", "какие ", "покажи ", "можно ли", "what ", "when ", "show ")
        )

        has_temporal_marker = bool(
            re.search(r"\b\d{1,2}(:\d{2})?\b", lower)
            or any(marker in lower for marker in ("сегодня", "завтра", "послезавтра", "утром", "днем", "днём", "вечером"))
            or re.search(r"\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b", lower)
            or re.search(r"\b\d{4}-\d{2}-\d{2}\b", lower)
        )

        has_event_context = any(
            marker in lower
            for marker in (
                "встреч",
                "дел",
                "задач",
                "созвон",
                "поход",
                "визит",
                "лекц",
                "трениров",
                "meeting",
                "task",
                "call",
                "appointment",
            )
        )

        if has_create_verb and (has_event_context or has_temporal_marker):
            return "create_event"

        if not any(marker in lower for marker in ("?", "когда", "что у меня", "какие планы")) and has_temporal_marker and has_event_context:
            return "create_event"

        schedule_question_markers = (
            "что у меня",
            "какие планы",
            "покажи планы",
            "покажи расписание",
            "когда свобод",
            "what do i have",
            "what's on my schedule",
            "when am i free",
        )
        if has_question and any(marker in lower for marker in schedule_question_markers):
            return "schedule_query"

        return "general"

    @staticmethod
    def is_in_domain(text: str) -> bool:
        lower = AITools._normalize_text_for_parsing(text).lower()

        off_topic_markers = (
            "анекдот",
            "шутк",
            "рецепт",
            "приготов",
            "матем",
            "матан",
            "интеграл",
            "производн",
            "алгебр",
            "геометр",
            "реши уравнение",
            "код на",
            "напиши программу",
            "javascript",
            "c++",
            "python script",
            "погода",
            "новости",
            "гороскоп",
            "история россии",
            "how to cook",
            "joke",
            "solve math",
            "recipe",
        )
        if any(marker in lower for marker in off_topic_markers):
            return False

        intent = AITools.detect_intent(lower)
        if intent != "general":
            return True

        domain_markers = (
            "календар",
            "расписан",
            "план",
            "задач",
            "событи",
            "напомин",
            "встреч",
            "свобод",
            "перенес",
            "перенести",
            "конфликт",
            "время в пути",
            "маршрут",
            "calendar",
            "schedule",
            "event",
            "task",
            "reminder",
            "free slot",
            "travel time",
            "route",
        )
        return any(marker in lower for marker in domain_markers)

    @staticmethod
    def _extract_date(lower: str, now_local: datetime) -> tuple[date, bool]:
        if "послезавтра" in lower:
            return (now_local + timedelta(days=2)).date(), True
        if "завтра" in lower:
            return (now_local + timedelta(days=1)).date(), True
        if "сегодня" in lower:
            return now_local.date(), True

        iso_match = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", lower)
        if iso_match:
            try:
                parsed = date(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))
                return parsed, True
            except ValueError:
                pass

        local_match = re.search(r"\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b", lower)
        if local_match:
            day = int(local_match.group(1))
            month = int(local_match.group(2))
            raw_year = local_match.group(3)
            year = now_local.year
            if raw_year:
                year_value = int(raw_year)
                if year_value < 100:
                    year_value += 2000
                year = year_value
            try:
                parsed = date(year, month, day)
            except ValueError:
                parsed = now_local.date()
            return parsed, True

        return now_local.date(), False

    @staticmethod
    def _normalize_hour(hour: int, lower: str) -> int:
        if any(marker in lower for marker in ("вечер", "вечером", "tonight", "evening")) and hour < 12:
            return hour + 12
        if any(marker in lower for marker in ("утро", "утром", "morning")) and hour == 12:
            return 0
        return hour

    @staticmethod
    def _normalize_token(token: str) -> str:
        return re.sub(r"\s+", " ", token.strip(" ,.!?")).replace("ё", "е").lower()

    @classmethod
    def _parse_hour_token(cls, token: str, *, genitive: bool = False) -> int | None:
        normalized = cls._normalize_token(token)
        if normalized.isdigit():
            value = int(normalized)
            return value if 0 <= value <= 23 else None
        if genitive:
            return cls._HOUR_GENITIVE.get(normalized)
        if normalized in cls._HOUR_CARDINAL:
            return cls._HOUR_CARDINAL[normalized]
        return cls._HOUR_GENITIVE.get(normalized)

    @classmethod
    def _parse_minute_token(cls, token: str) -> int | None:
        normalized = cls._normalize_token(token)
        if normalized.isdigit():
            value = int(normalized)
            return value if 0 <= value < 60 else None
        return cls._MINUTE_WORDS.get(normalized)

    @staticmethod
    def _normalize_hour_with_period(hour: int, period: str | None, lower: str) -> int:
        if period is None:
            return AITools._normalize_hour(hour, lower)

        marker = period.lower()
        if marker in {"вечера", "вечер", "дня"}:
            if 0 <= hour < 12:
                return hour + 12
            return hour
        if marker in {"утра", "утро"}:
            if hour == 12:
                return 0
            return hour
        if marker in {"ночи", "ночь"}:
            if hour == 12:
                return 0
            if 0 <= hour <= 5:
                return hour
            if 6 <= hour < 12:
                return hour + 12
        return AITools._normalize_hour(hour, lower)

    def _extract_time_range(self, lower: str) -> tuple[tuple[int, int] | None, tuple[int, int] | None, bool, bool]:
        range_match = re.search(
            r"(?:с\s*)?(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи)?\s*(?:до|\-|—)\s*"
            r"(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи)?",
            lower,
        )
        if range_match:
            start_period = range_match.group(3)
            end_period = range_match.group(6)
            shared_period = start_period or end_period
            sh = self._normalize_hour_with_period(int(range_match.group(1)), shared_period, lower)
            sm = int(range_match.group(2) or 0)
            eh = self._normalize_hour_with_period(int(range_match.group(4)), end_period or shared_period, lower)
            em = int(range_match.group(5) or 0)
            return (sh, sm), (eh, em), True, False

        period_only_match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи)\b", lower)
        if period_only_match:
            sh = self._normalize_hour_with_period(
                int(period_only_match.group(1)),
                period_only_match.group(3),
                lower,
            )
            sm = int(period_only_match.group(2) or 0)
            return (sh, sm), None, True, False

        single_match = re.search(r"(?:\bв\b|\bк\b|\bat\b)\s*(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи)?", lower)
        if single_match:
            sh = self._normalize_hour_with_period(
                int(single_match.group(1)),
                single_match.group(3),
                lower,
            )
            sm = int(single_match.group(2) or 0)
            return (sh, sm), None, True, False

        half_match = re.search(r"\b(?:пол|половина)\s+([а-яё]+)(?:\s+(утра|дня|вечера|ночи))?\b", lower)
        if half_match:
            target_hour = self._parse_hour_token(half_match.group(1), genitive=True)
            if target_hour is not None:
                hour = self._normalize_hour_with_period((target_hour - 1) % 24, half_match.group(2), lower)
                return (hour, 30), None, True, False

        quarter_match = re.search(r"\bчетверть\s+([а-яё]+)(?:\s+(утра|дня|вечера|ночи))?\b", lower)
        if quarter_match:
            target_hour = self._parse_hour_token(quarter_match.group(1), genitive=True)
            if target_hour is not None:
                hour = self._normalize_hour_with_period((target_hour - 1) % 24, quarter_match.group(2), lower)
                return (hour, 15), None, True, False

        third_match = re.search(r"\bтреть\s+([а-яё]+)(?:\s+(утра|дня|вечера|ночи))?\b", lower)
        if third_match:
            target_hour = self._parse_hour_token(third_match.group(1), genitive=True)
            if target_hour is not None:
                hour = self._normalize_hour_with_period((target_hour - 1) % 24, third_match.group(2), lower)
                return (hour, 20), None, True, False

        minus_tail_match = re.search(r"\bбез\s+(.+)", lower)
        if minus_tail_match:
            tail_tokens = [self._normalize_token(token) for token in minus_tail_match.group(1).split() if token]
            minute_value: int | None = None
            next_index = 0
            if len(tail_tokens) >= 2:
                two_word_minute = f"{tail_tokens[0]} {tail_tokens[1]}"
                minute_value = self._parse_minute_token(two_word_minute)
                if minute_value is not None:
                    next_index = 2
            if minute_value is None and tail_tokens:
                if tail_tokens[0] == "четверти":
                    minute_value = 15
                    next_index = 1
                else:
                    minute_value = self._parse_minute_token(tail_tokens[0])
                    if minute_value is not None:
                        next_index = 1

            if minute_value is not None and 0 < minute_value < 60 and next_index < len(tail_tokens):
                if tail_tokens[next_index] in {"минут", "минута", "минуты"}:
                    next_index += 1
                if next_index < len(tail_tokens):
                    hour_token = tail_tokens[next_index]
                    period = (
                        tail_tokens[next_index + 1]
                        if next_index + 1 < len(tail_tokens) and tail_tokens[next_index + 1] in {"утра", "дня", "вечера", "ночи"}
                        else None
                    )
                    target_hour = self._parse_hour_token(hour_token, genitive=False)
                    if target_hour is not None:
                        hour = self._normalize_hour_with_period((target_hour - 1) % 24, period, lower)
                        return (hour, 60 - minute_value), None, True, False

        has_coarse_hint = any(marker in lower for marker in ("утром", "утро", "днем", "днём", "вечером", "вечер", "morning", "evening", "afternoon"))
        return None, None, False, has_coarse_hint

    @staticmethod
    def _extract_duration_minutes(lower: str) -> int | None:
        duration_match = re.search(r"на\s*(\d+)\s*(час|часа|часов|мин|минут)", lower)
        if not duration_match:
            duration_match = re.search(r"for\s*(\d+)\s*(hour|hours|min|minutes)", lower)
        if not duration_match:
            return None

        value = int(duration_match.group(1))
        unit = duration_match.group(2)
        if unit.startswith("час") or unit.startswith("hour"):
            return value * 60
        return value

    @staticmethod
    def _extract_reminder_offset(lower: str) -> int | None:
        reminder_match = re.search(r"напомни\s*за\s*(\d+)\s*(мин|минут)", lower)
        if not reminder_match:
            reminder_match = re.search(r"remind\s*me\s*(\d+)\s*(min|minutes)\s*before", lower)
        return int(reminder_match.group(1)) if reminder_match else None

    @staticmethod
    def _normalize_location(location: str) -> str:
        value = location.strip(" ,.")
        value = re.sub(r"\s+", " ", value)
        return value.strip()

    @staticmethod
    def _looks_like_time_fragment(value: str) -> bool:
        normalized = value.strip().lower()
        if not normalized:
            return False
        if re.search(r"\b\d{1,2}(:\d{2})?\b", normalized):
            return True
        words = [token for token in re.split(r"\s+", normalized) if token]
        if not words:
            return False
        time_words = {
            "пол",
            "половина",
            "четверть",
            "треть",
            "без",
            "утра",
            "дня",
            "вечера",
            "ночи",
            "минут",
            "минута",
            "минуты",
            "пяти",
            "десяти",
            "пятнадцати",
            "двадцати",
            "тридцати",
            "первого",
            "второго",
            "третьего",
            "четвертого",
            "четвёртого",
            "пятого",
            "шестого",
            "седьмого",
            "восьмого",
            "девятого",
            "десятого",
            "одиннадцатого",
            "двенадцатого",
            "один",
            "одна",
            "два",
            "две",
            "три",
            "четыре",
            "пять",
            "шесть",
            "семь",
            "восемь",
            "девять",
            "десять",
            "одиннадцать",
            "двенадцать",
        }
        return all(word in time_words for word in words)

    def _extract_location(self, text: str) -> str | None:
        cleaned = re.sub(
            r"\b(добав[а-я]*|созда[а-я]*|запланир[а-я]*|внес[а-я]*|постав[а-я]*|в календар[ьяе]*|напомни[а-я]*|add|create|schedule)\b",
            " ",
            text,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        location_match = re.search(r"(?:возле|около|рядом с|по адресу)\s+(.+)$", cleaned, flags=re.IGNORECASE)
        if location_match:
            return self._normalize_location(location_match.group(1))

        location_match = re.search(r"\bу\s+(?!меня\b)(.+)$", cleaned, flags=re.IGNORECASE)
        if location_match:
            return self._normalize_location(location_match.group(1))

        in_candidates = re.findall(r"\bв\s+([^,.;!?]+)", cleaned, flags=re.IGNORECASE)
        for raw_candidate in reversed(in_candidates):
            candidate = raw_candidate.strip()
            candidate = re.sub(r"^\d{1,2}(:\d{2})?\s+", "", candidate)
            if self._looks_like_time_fragment(candidate):
                continue
            if len(candidate) > 2 and not re.match(r"^\d{1,2}(:\d{2})?$", candidate):
                return self._normalize_location(candidate)

        return None

    @staticmethod
    def _is_ambiguous_location_text(location_text: str) -> bool:
        value = location_text.strip().lower()
        if not value:
            return True

        generic = {
            "центр",
            "в центре",
            "дома",
            "дом",
            "у дома",
            "у работы",
            "работа",
            "офис",
            "кафе",
            "парк",
        }
        if value in generic:
            return True

        if any(char.isdigit() for char in value) or "," in value:
            return False

        words = [item for item in value.split(" ") if item]
        return len(words) <= 1

    @staticmethod
    def _extract_title(text: str, lower: str) -> tuple[str, bool]:
        meeting_match = re.search(
            r"(?:встрет[а-я]*|встреч[а-я]*)\s+с\s+([a-zа-я0-9\-\s]+?)(?:\s+(?:сегодня|завтра|послезавтра|утром|днем|днём|вечером|в|к|на|у|возле|около|рядом)|$)",
            lower,
            flags=re.IGNORECASE,
        )
        if meeting_match:
            person = meeting_match.group(1).strip(" ,.")
            person = re.sub(r"\bдруг(ом|а|у)?\b", "другом", person, flags=re.IGNORECASE)
            title = f"Встреча с {person}" if person else "Встреча"
            return title[:96].strip(), False

        typed_titles = [
            ("встреч", "Встреча"),
            ("созвон", "Созвон"),
            ("лекц", "Лекция"),
            ("трениров", "Тренировка"),
            ("врач", "Визит к врачу"),
            ("стомат", "Визит к стоматологу"),
            ("пары", "Пары"),
            ("работ", "Рабочая задача"),
            ("пробеж", "Пробежка"),
        ]
        for marker, title in typed_titles:
            if marker in lower:
                return title, title in {"Созвон", "Лекция", "Тренировка", "Рабочая задача"}

        compact = re.sub(
            r"\b(добав[а-я]*|созда[а-я]*|запланир[а-я]*|внес[а-я]*|постав[а-я]*|назнач[а-я]*|в календар[ьяе]*|напомни[а-я]*|add|create|schedule)\b",
            "",
            text,
            flags=re.IGNORECASE,
        )
        compact = re.sub(r"(?:с\s*)?\d{1,2}(:\d{2})?\s*(?:до|\-|—)\s*\d{1,2}(:\d{2})?", "", compact)
        compact = re.sub(r"\b\d{1,2}(:\d{2})?\b", "", compact)
        compact = re.sub(r"\b(сегодня|завтра|послезавтра|утром|днем|днём|вечером)\b", "", compact, flags=re.IGNORECASE)
        compact = re.sub(r"\b(у меня|мне|надо|нужно|хочу|пожалуйста|please)\b", "", compact, flags=re.IGNORECASE)
        compact = re.sub(r"\s+", " ", compact).strip(" ,.")

        words = [word for word in compact.split(" ") if word]
        candidate = " ".join(words[:6]).strip()
        if not candidate:
            return "Событие", True

        normalized_candidate = candidate[0].upper() + candidate[1:] if len(candidate) > 1 else candidate.upper()
        title = normalized_candidate[:96].strip()
        is_generic = title.lower() in {"событие", "встреча", "задача", "созвон", "новое событие"}
        return title, is_generic

    @staticmethod
    def extract_route_pair_titles(text: str) -> tuple[str, str] | None:
        normalized = text.strip()
        match = re.search(r"\bот\s+(.+?)\s+до\s+(.+?)(?:[?.!,]|$)", normalized, flags=re.IGNORECASE)
        if not match:
            match = re.search(r"\bмежду\s+(.+?)\s+и\s+(.+?)(?:[?.!,]|$)", normalized, flags=re.IGNORECASE)
        if not match:
            return None

        a = match.group(1).strip(" \"'`«»")
        b = match.group(2).strip(" \"'`«»")
        if not a or not b:
            return None
        return a, b

    @staticmethod
    def extract_route_single_target(text: str) -> str | None:
        normalized = text.strip()
        match = re.search(r"\bдо\s+(.+?)(?:[?.!,]|$)", normalized, flags=re.IGNORECASE)
        if not match:
            return None
        target = match.group(1).strip(" \"'`«»")
        return target or None

    def try_parse_task(self, text: str, now_local: datetime | None = None) -> ParsedTask | None:
        normalized = self._normalize_text_for_parsing(text)
        lower = normalized.lower()

        if self.detect_intent(normalized) != "create_event":
            return None

        current_local = now_local or datetime.now(timezone.utc)
        event_date, has_explicit_date = self._extract_date(lower, current_local)

        start_time, end_time, has_explicit_time, has_coarse_time_hint = self._extract_time_range(lower)
        duration_minutes = self._extract_duration_minutes(lower)
        reminder_offset = self._extract_reminder_offset(lower)

        if has_explicit_time and start_time is not None:
            start_h, start_m = start_time
            start_local = datetime(
                event_date.year,
                event_date.month,
                event_date.day,
                start_h,
                start_m,
                tzinfo=current_local.tzinfo or timezone.utc,
            )

            end_local: datetime | None = None
            if end_time is not None:
                end_h, end_m = end_time
                end_local = datetime(
                    event_date.year,
                    event_date.month,
                    event_date.day,
                    end_h,
                    end_m,
                    tzinfo=current_local.tzinfo or timezone.utc,
                )
                if end_local <= start_local:
                    end_local += timedelta(days=1)
            elif duration_minutes is not None:
                end_local = start_local + timedelta(minutes=duration_minutes)
        else:
            start_local = datetime(
                event_date.year,
                event_date.month,
                event_date.day,
                0,
                0,
                tzinfo=current_local.tzinfo or timezone.utc,
            )
            end_local = start_local + timedelta(days=1)

        title, title_is_generic = self._extract_title(normalized, lower)
        location_text = self._extract_location(normalized)
        location_requires_clarification = bool(location_text and self._is_ambiguous_location_text(location_text))

        return ParsedTask(
            title=title,
            start_at=start_local.astimezone(timezone.utc),
            end_at=end_local.astimezone(timezone.utc) if end_local else None,
            location_text=location_text,
            reminder_offset=reminder_offset,
            has_explicit_date=has_explicit_date,
            has_explicit_time=has_explicit_time,
            has_coarse_time_hint=has_coarse_time_hint,
            has_explicit_location=bool(location_text) and not location_requires_clarification,
            location_requires_clarification=location_requires_clarification,
            title_is_generic=title_is_generic,
        )

    async def create_event_from_text(self, user_id, text: str, now_local: datetime | None = None):
        parsed = self.try_parse_task(text, now_local=now_local)
        if not parsed:
            return None
        if not parsed.has_explicit_date:
            return None

        payload = EventCreate(
            title=parsed.title,
            description="Created by AI assistant",
            location_text=parsed.location_text if parsed.has_explicit_location else None,
            start_at=parsed.start_at,
            end_at=parsed.end_at,
            all_day=not parsed.has_explicit_time,
            status=EventStatus.PLANNED,
            priority=1,
        )

        event = await self.event_service.create_event(user_id=user_id, payload=payload)
        if parsed.reminder_offset and parsed.has_explicit_time:
            await self.event_service.reminder_service.add_reminder(
                user_id=user_id,
                event_id=event.id,
                offset_minutes=parsed.reminder_offset,
            )
        return event, parsed

    def parse_refinement(
        self,
        text: str,
        base_start_at: datetime,
        base_end_at: datetime,
        now_local: datetime | None = None,
    ) -> RefinementParse:
        normalized = self._normalize_text_for_parsing(text)
        lower = normalized.lower()
        updates: dict = {}

        current_local = now_local or base_start_at.astimezone(base_start_at.tzinfo or timezone.utc)
        event_date, has_explicit_date = self._extract_date(lower, current_local)
        start_time, end_time, has_explicit_time, has_coarse_time_hint = self._extract_time_range(lower)

        if has_explicit_time and start_time is not None:
            start_h, start_m = start_time
            start_local = datetime(
                event_date.year,
                event_date.month,
                event_date.day,
                start_h,
                start_m,
                tzinfo=current_local.tzinfo or timezone.utc,
            )
            if end_time is not None:
                end_h, end_m = end_time
                end_local = datetime(
                    event_date.year,
                    event_date.month,
                    event_date.day,
                    end_h,
                    end_m,
                    tzinfo=current_local.tzinfo or timezone.utc,
                )
                if end_local <= start_local:
                    end_local += timedelta(days=1)
            else:
                end_local = start_local + timedelta(hours=1)

            updates["start_at"] = start_local.astimezone(timezone.utc)
            updates["end_at"] = end_local.astimezone(timezone.utc)
            updates["all_day"] = False
        elif has_explicit_date:
            base_start_local = base_start_at.astimezone(current_local.tzinfo or timezone.utc)
            base_end_local = base_end_at.astimezone(current_local.tzinfo or timezone.utc)
            duration = base_end_local - base_start_local
            if duration <= timedelta(0):
                duration = timedelta(hours=1)

            start_local = datetime(
                event_date.year,
                event_date.month,
                event_date.day,
                base_start_local.hour,
                base_start_local.minute,
                tzinfo=current_local.tzinfo or timezone.utc,
            )
            end_local = start_local + duration
            updates["start_at"] = start_local.astimezone(timezone.utc)
            updates["end_at"] = end_local.astimezone(timezone.utc)

        if any(marker in lower for marker in ("без места", "без адреса", "убери адрес", "без локации")):
            updates["location_text"] = None
            updates["location_lat"] = None
            updates["location_lon"] = None
            updates["location_source"] = "manual_text"
            has_explicit_location = False
        else:
            location_text = self._extract_location(normalized)
            has_explicit_location = bool(location_text)
            if location_text:
                updates["location_text"] = location_text
                updates["location_lat"] = None
                updates["location_lon"] = None
                updates["location_source"] = "manual_text"

        return RefinementParse(
            updates=updates,
            has_explicit_time=has_explicit_time,
            has_coarse_time_hint=has_coarse_time_hint,
            has_explicit_location=has_explicit_location,
            has_explicit_date=has_explicit_date,
        )

    async def list_events(self, user_id, from_dt: datetime, to_dt: datetime):
        events, _ = await self.event_service.list_events(
            user_id=user_id,
            from_dt=from_dt,
            to_dt=to_dt,
            calendar_id=None,
            status=None,
            q=None,
            limit=500,
            offset=0,
        )
        return events

    async def find_free_slots(self, user_id, duration_minutes: int, from_dt: datetime, to_dt: datetime):
        return await self.event_service.find_free_slots(
            user_id=user_id,
            duration_minutes=duration_minutes,
            from_dt=from_dt,
            to_dt=to_dt,
        )
