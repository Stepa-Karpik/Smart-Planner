from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.services.ai.tools import AITools


def _tools() -> AITools:
    return AITools(SimpleNamespace())  # type: ignore[arg-type]


def _msk_now() -> datetime:
    return datetime(2026, 2, 16, 12, 0, tzinfo=ZoneInfo("Europe/Moscow"))


def test_offtopic_requests_are_out_of_domain():
    tools = _tools()
    assert tools.is_in_domain("\u0440\u0430\u0441\u0441\u043a\u0430\u0436\u0438 \u0430\u043d\u0435\u043a\u0434\u043e\u0442") is False
    assert tools.is_in_domain("\u043a\u0430\u043a \u0440\u0435\u0448\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443 \u043f\u043e \u043c\u0430\u0442\u0430\u043d\u0443") is False


def test_schedule_query_does_not_become_create_intent():
    tools = _tools()
    text = "\u0447\u0442\u043e \u0443 \u043c\u0435\u043d\u044f \u0437\u0430\u0432\u0442\u0440\u0430?"
    assert tools.detect_intent(text) in {"list_tomorrow", "schedule_query"}
    assert tools.try_parse_task(text, now_local=_msk_now()) is None


def test_create_event_without_explicit_time_creates_draft_interval():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0443 \u043c\u0435\u043d\u044f \u0437\u0430\u0432\u0442\u0440\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0430 \u0441 \u0434\u0440\u0443\u0433\u043e\u043c",
        now_local=_msk_now(),
    )

    assert parsed is not None
    assert parsed.title == "\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0441 \u0434\u0440\u0443\u0433\u043e\u043c"
    assert parsed.has_explicit_date is True
    assert parsed.has_explicit_time is False
    assert parsed.has_coarse_time_hint is False
    assert parsed.end_at is not None
    assert parsed.end_at - parsed.start_at == timedelta(days=1)
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour == 0
    assert parsed.start_at.astimezone(_msk_now().tzinfo).minute == 0


def test_explicit_time_is_kept_without_0900_default():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0434\u043e\u0431\u0430\u0432\u044c \u0432\u0441\u0442\u0440\u0435\u0447\u0443 \u0437\u0430\u0432\u0442\u0440\u0430 \u0432 18:30 \u0432 \u0446\u0435\u043d\u0442\u0440\u0435",
        now_local=_msk_now(),
    )

    assert parsed is not None
    assert parsed.has_explicit_date is True
    assert parsed.has_explicit_time is True
    assert parsed.has_coarse_time_hint is False
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour == 18
    assert parsed.start_at.astimezone(_msk_now().tzinfo).minute == 30
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour != 9


def test_coarse_time_hint_requires_clarification():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0437\u0430\u0432\u0442\u0440\u0430 \u0432\u0435\u0447\u0435\u0440\u043e\u043c \u0432\u0441\u0442\u0440\u0435\u0447\u0430",
        now_local=_msk_now(),
    )

    assert parsed is not None
    assert parsed.has_explicit_time is False
    assert parsed.has_coarse_time_hint is True


def test_colloquial_evening_time_is_parsed_as_explicit():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0434\u043e\u0431\u0430\u0432\u044c \u0432\u0441\u0442\u0440\u0435\u0447\u0443 \u0437\u0430\u0432\u0442\u0440\u0430 8 \u0432\u0435\u0447\u0435\u0440\u0430",
        now_local=_msk_now(),
    )
    assert parsed is not None
    assert parsed.has_explicit_time is True
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour == 20
    assert parsed.start_at.astimezone(_msk_now().tzinfo).minute == 0


def test_colloquial_half_hour_is_parsed():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0434\u043e\u0431\u0430\u0432\u044c \u0432\u0441\u0442\u0440\u0435\u0447\u0443 \u0437\u0430\u0432\u0442\u0440\u0430 \u0432 \u043f\u043e\u043b \u0432\u043e\u0441\u044c\u043c\u043e\u0433\u043e \u0432\u0435\u0447\u0435\u0440\u0430",
        now_local=_msk_now(),
    )
    assert parsed is not None
    assert parsed.has_explicit_time is True
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour == 19
    assert parsed.start_at.astimezone(_msk_now().tzinfo).minute == 30
    assert parsed.location_text is None


def test_colloquial_minus_minutes_is_parsed():
    tools = _tools()
    parsed = tools.try_parse_task(
        "\u0434\u043e\u0431\u0430\u0432\u044c \u0432\u0441\u0442\u0440\u0435\u0447\u0443 \u0437\u0430\u0432\u0442\u0440\u0430 \u0431\u0435\u0437 \u043f\u044f\u0442\u043d\u0430\u0434\u0446\u0430\u0442\u0438 \u0432\u043e\u0441\u0435\u043c\u044c \u0432\u0435\u0447\u0435\u0440\u0430",
        now_local=_msk_now(),
    )
    assert parsed is not None
    assert parsed.has_explicit_time is True
    assert parsed.start_at.astimezone(_msk_now().tzinfo).hour == 19
    assert parsed.start_at.astimezone(_msk_now().tzinfo).minute == 45
    assert parsed.location_text is None
