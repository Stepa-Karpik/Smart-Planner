from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CALENDAR_VIEW = ROOT / "frontend" / "components" / "event-calendar-view.tsx"
GANTT_VIEW = ROOT / "frontend" / "components" / "event-gantt.tsx"
TIMELINE = ROOT / "frontend" / "components" / "event-timeline.tsx"
EVENTS_PAGE = ROOT / "frontend" / "app" / "(dashboard)" / "events" / "page.tsx"
EDITOR = ROOT / "frontend" / "components" / "event-editor-modal.tsx"
CALENDAR_MANAGER = ROOT / "frontend" / "components" / "calendar-manager-dialog.tsx"
COLOR_HELPER = ROOT / "frontend" / "lib" / "calendar-colors.ts"
CALENDAR_SCHEMA = ROOT / "backend" / "app" / "schemas" / "calendar.py"
CALENDAR_MODEL = ROOT / "backend" / "app" / "models" / "calendar.py"
MIGRATION = ROOT / "backend" / "alembic" / "versions" / "0014_calendar_dark_color.py"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_calendar_drag_has_live_preview_and_current_target_hitbox():
    source = read(CALENDAR_VIEW)

    assert "hoverDayKey" in source
    assert "previewEventsForDay" in source
    assert "data-calendar-day" in source
    assert "dragEvent.currentTarget.dataset.calendarDay" in source
    assert "onDrop" in source


def test_timeline_and_gantt_handle_long_events_as_thin_lanes():
    timeline = read(TIMELINE)
    gantt = read(GANTT_VIEW)

    assert "splitEventForTimelineDay" in timeline
    assert "isLongEvent" in timeline
    assert "long-event-lane" in gantt
    assert "collapseLongEventSegments" in gantt
    assert "travelInfo && !segment.isLongEvent" in gantt


def test_dynamic_time_statuses_are_rendered():
    source = read(COLOR_HELPER)

    assert "getEventTemporalStatus" in source
    assert "in_progress" in source
    assert "past" in source


def test_calendar_manager_moved_out_of_event_editor_and_supports_theme_colors():
    events_page = read(EVENTS_PAGE)
    editor = read(EDITOR)
    manager = read(CALENDAR_MANAGER)

    assert "CalendarManagerDialog" in events_page
    assert "Календари" in events_page
    assert "handleCreateCalendar" not in editor
    assert "handleUpdateCalendar" not in editor
    assert "handleDeleteCalendar" not in editor
    assert "suggestDarkCalendarColor" in manager
    assert "color_dark" in manager


def test_backend_calendar_has_dark_color_field():
    assert "color_dark" in read(CALENDAR_MODEL)
    assert "color_dark" in read(CALENDAR_SCHEMA)
    assert "op.add_column(\"calendars\"" in read(MIGRATION)
