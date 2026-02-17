from datetime import datetime, timedelta, timezone

import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_events_and_reminders_crud(app_client, auth_headers):
    now = datetime.now(timezone.utc).replace(microsecond=0)
    payload = {
        "title": "Integration Event",
        "description": "integration test",
        "start_at": (now + timedelta(hours=2)).isoformat(),
        "end_at": (now + timedelta(hours=3)).isoformat(),
        "priority": 2,
        "status": "planned",
    }

    created = await app_client.post("/api/v1/events", json=payload, headers=auth_headers)
    assert created.status_code == 201
    event_id = created.json()["data"]["id"]

    listed = await app_client.get("/api/v1/events", headers=auth_headers)
    assert listed.status_code == 200
    assert any(item["id"] == event_id for item in listed.json()["data"])

    patched = await app_client.patch(
        f"/api/v1/events/{event_id}",
        json={"title": "Integration Event Updated", "priority": 3},
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["title"] == "Integration Event Updated"

    reminder = await app_client.post(
        f"/api/v1/events/{event_id}/reminders",
        json={"offset_minutes": 30},
        headers=auth_headers,
    )
    assert reminder.status_code == 201
    reminder_id = reminder.json()["data"]["id"]

    reminder_list = await app_client.get(f"/api/v1/events/{event_id}/reminders", headers=auth_headers)
    assert reminder_list.status_code == 200
    assert any(item["id"] == reminder_id for item in reminder_list.json()["data"])

    canceled = await app_client.delete(f"/api/v1/reminders/{reminder_id}", headers=auth_headers)
    assert canceled.status_code == 200
    assert canceled.json()["data"]["ok"] is True
