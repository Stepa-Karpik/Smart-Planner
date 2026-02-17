from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.enums import ReminderStatus
from app.services.reminders import ReminderService


class DummySession:
    def __init__(self):
        self.flushed = False

    async def flush(self):
        self.flushed = True


@pytest.mark.asyncio
async def test_recalculate_reminders_on_event_time_change():
    session = DummySession()
    service = ReminderService(session)  # type: ignore[arg-type]

    reminder = SimpleNamespace(
        offset_minutes=15,
        status=ReminderStatus.FAILED,
        last_error="old",
        scheduled_at=None,
    )

    async def fake_active_by_event(event_id):
        assert event_id == event_uuid
        return [reminder]

    event_uuid = uuid4()
    service.reminders.active_by_event = fake_active_by_event  # type: ignore[method-assign]

    new_start = datetime(2026, 2, 20, 17, 0, tzinfo=timezone.utc)
    await service.recalculate_for_event(event_uuid, new_start)

    assert reminder.scheduled_at == new_start - timedelta(minutes=15)
    assert reminder.status == ReminderStatus.SCHEDULED
    assert reminder.last_error is None
    assert session.flushed is True
