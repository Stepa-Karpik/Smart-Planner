from datetime import datetime, timedelta, timezone

from app.services.reminders import calculate_scheduled_at


def test_calculate_scheduled_at():
    start_at = datetime(2026, 2, 20, 15, 0, tzinfo=timezone.utc)
    result = calculate_scheduled_at(start_at, 30)
    assert result == start_at - timedelta(minutes=30)
