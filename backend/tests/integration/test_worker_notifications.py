from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import Calendar, Event, Reminder, TelegramLink, User
from app.workers.notification_worker import process_due_reminders


class FakeBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, chat_id, text, reply_markup=None):
        self.sent.append({"chat_id": chat_id, "text": text})


@pytest.mark.integration
@pytest.mark.asyncio
async def test_worker_marks_sent_and_failed(db_session, redis_client):
    user_with_tg = User(email="worker1@example.com", username="worker1", password_hash="hash")
    user_without_tg = User(email="worker2@example.com", username="worker2", password_hash="hash")
    db_session.add_all([user_with_tg, user_without_tg])
    await db_session.flush()

    cal1 = Calendar(id=__import__("uuid").uuid4(), user_id=user_with_tg.id, title="Default", color="#000000", is_default=True)
    cal2 = Calendar(id=__import__("uuid").uuid4(), user_id=user_without_tg.id, title="Default", color="#000000", is_default=True)
    db_session.add_all([cal1, cal2])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    event1 = Event(
        calendar_id=cal1.id,
        title="E1",
        start_at=now + timedelta(minutes=5),
        end_at=now + timedelta(minutes=35),
        status="planned",
        priority=1,
    )
    event2 = Event(
        calendar_id=cal2.id,
        title="E2",
        start_at=now + timedelta(minutes=5),
        end_at=now + timedelta(minutes=35),
        status="planned",
        priority=1,
    )
    db_session.add_all([event1, event2])
    await db_session.flush()

    reminder1 = Reminder(event_id=event1.id, offset_minutes=10, scheduled_at=now - timedelta(minutes=1), status="scheduled")
    reminder2 = Reminder(event_id=event2.id, offset_minutes=10, scheduled_at=now - timedelta(minutes=1), status="scheduled")
    db_session.add_all([reminder1, reminder2])

    db_session.add(TelegramLink(user_id=user_with_tg.id, telegram_chat_id=111111, telegram_username="u1", is_confirmed=True))
    await db_session.commit()

    bot = FakeBot()
    await process_due_reminders(bot)

    await db_session.refresh(reminder1)
    await db_session.refresh(reminder2)

    assert reminder1.status == "sent"
    assert reminder2.status == "failed"
    assert bot.sent
