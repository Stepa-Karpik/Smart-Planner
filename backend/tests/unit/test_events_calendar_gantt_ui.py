from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EVENTS_PAGE = ROOT / "frontend" / "app" / "(dashboard)" / "events" / "page.tsx"
CALENDAR_VIEW = ROOT / "frontend" / "components" / "event-calendar-view.tsx"
GANTT_VIEW = ROOT / "frontend" / "components" / "event-gantt.tsx"
EDITOR_MODAL = ROOT / "frontend" / "components" / "event-editor-modal.tsx"
CALENDAR_MANAGER = ROOT / "frontend" / "components" / "calendar-manager-dialog.tsx"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_events_page_default_range_includes_distant_events():
    source = read(EVENTS_PAGE)

    assert "end.setMonth(end.getMonth() + 6)" in source
    assert "limit: 500" in source


def test_calendar_view_supports_drag_drop_reschedule_and_calendar_colors():
    source = read(CALENDAR_VIEW)

    assert "onEventMove" in source
    assert "draggable" in source
    assert "onDragOver" in source
    assert "onDrop" in source
    assert "calendarColor" in source


def test_gantt_splits_long_events_by_day_and_uses_calendar_colors():
    source = read(GANTT_VIEW)

    assert "splitEventIntoDaySegments" in source
    assert "segment.isContinuation" in source
    assert "calendarColor" in source
    assert "linear-gradient" in source


def test_events_page_travel_uses_previous_event_or_active_long_event():
    source = read(EVENTS_PAGE)

    assert "findTravelSourceForEvent" in source
    assert "findActiveLongEvent" in source
    assert "source.kind === \"event\"" in source
    assert "source.kind === \"home\"" in source
    assert "travelDetails" in source


def test_event_editor_has_calendar_management_actions():
    editor = read(EDITOR_MODAL)
    manager = read(CALENDAR_MANAGER)

    assert "handleUpdateCalendar" not in editor
    assert "handleDeleteCalendar" not in editor
    assert "handleUpdateCalendar" in manager
    assert "handleDeleteCalendar" in manager
