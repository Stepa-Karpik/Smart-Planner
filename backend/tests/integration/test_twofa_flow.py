from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models import User
from app.services.twofa import TwoFactorAuthService


async def _register_and_login(client, *, email: str, username: str, password: str = "StrongPass123"):
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert register.status_code == 201
    body = register.json()["data"]
    return {
        "access_token": body["tokens"]["access_token"],
        "refresh_token": body["tokens"]["refresh_token"],
        "password": password,
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_requires_twofa_totp_and_verifies(app_client, db_session):
    creds = await _register_and_login(app_client, email="twofa1@example.com", username="twofa1")

    user = await db_session.scalar(select(User).where(User.username == "twofa1"))
    assert user is not None
    secret = TwoFactorAuthService._generate_totp_secret()
    user.twofa_method = "totp"
    user.twofa_totp_secret = secret
    await db_session.commit()

    login = await app_client.post("/api/v1/auth/login", json={"login": "twofa1", "password": creds["password"]})
    assert login.status_code == 200
    login_data = login.json()["data"]
    assert login_data["requires_twofa"] is True
    assert login_data["twofa_method"] == "totp"
    assert "tokens" not in login_data or login_data["tokens"] is None

    step = TwoFactorAuthService.current_totp_step(datetime.now(timezone.utc))
    code = TwoFactorAuthService._hotp(secret, step)
    verify = await app_client.post(
        "/api/v1/auth/twofa/totp/verify",
        json={"twofa_session_id": login_data["twofa_session_id"], "code": code},
    )
    assert verify.status_code == 200
    verify_data = verify.json()["data"]
    assert verify_data["tokens"]["access_token"]
    assert verify_data["requires_twofa"] is False


@pytest.mark.integration
@pytest.mark.asyncio
async def test_totp_setup_and_disable_flow(app_client):
    creds = await _register_and_login(app_client, email="twofa2@example.com", username="twofa2")
    headers = {"Authorization": f"Bearer {creds['access_token']}"}

    setup = await app_client.post("/api/v1/integrations/twofa/totp/setup", headers=headers)
    assert setup.status_code == 200
    setup_data = setup.json()["data"]
    assert setup_data["secret"]
    assert setup_data["otpauth_uri"].startswith("otpauth://")

    step = TwoFactorAuthService.current_totp_step(datetime.now(timezone.utc))
    code = TwoFactorAuthService._hotp(setup_data["secret"], step)
    verify_setup = await app_client.post(
        "/api/v1/integrations/twofa/totp/verify-setup",
        headers=headers,
        json={"pending_id": setup_data["pending_id"], "code": code},
    )
    assert verify_setup.status_code == 200

    settings = await app_client.get("/api/v1/integrations/twofa", headers=headers)
    assert settings.status_code == 200
    assert settings.json()["data"]["twofa_method"] == "totp"

    code2 = TwoFactorAuthService._hotp(setup_data["secret"], TwoFactorAuthService.current_totp_step(datetime.now(timezone.utc)))
    disable = await app_client.post("/api/v1/integrations/twofa/totp/disable", headers=headers, json={"code": code2})
    assert disable.status_code == 200
    settings_after = await app_client.get("/api/v1/integrations/twofa", headers=headers)
    assert settings_after.json()["data"]["twofa_method"] == "none"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_telegram_twofa_pending_approve_and_deny(app_client, db_session, redis_client, monkeypatch):
    class DummyBot:
        def __init__(self):
            self.sent = []

        async def send_message(self, **kwargs):
            self.sent.append(kwargs)

    dummy_bot = DummyBot()
    monkeypatch.setattr("app.services.twofa.get_bot", lambda: dummy_bot)

    creds = await _register_and_login(app_client, email="twofa3@example.com", username="twofa3")
    headers = {"Authorization": f"Bearer {creds['access_token']}"}

    user = await db_session.scalar(select(User).where(User.username == "twofa3"))
    assert user is not None
    from app.models import TelegramLink

    db_session.add(TelegramLink(user_id=user.id, telegram_chat_id=123456789, telegram_username="tester", is_confirmed=True))
    await db_session.commit()

    enable_request = await app_client.post("/api/v1/integrations/twofa/telegram/enable-request", headers=headers)
    assert enable_request.status_code == 200
    pending_id = enable_request.json()["data"]["pending_id"]
    assert dummy_bot.sent

    service = TwoFactorAuthService(db_session, redis_client)
    approved = await service.confirm_telegram_method_change_from_callback(chat_id=123456789, pending_id=UUID(pending_id), decision="approve")
    assert approved["status"] == "approved"
    await db_session.refresh(user)
    assert user.twofa_method == "telegram"

    disable_request = await app_client.post("/api/v1/integrations/twofa/telegram/disable-request", headers=headers)
    assert disable_request.status_code == 200
    pending_id_2 = disable_request.json()["data"]["pending_id"]
    denied = await service.confirm_telegram_method_change_from_callback(chat_id=123456789, pending_id=UUID(pending_id_2), decision="deny")
    assert denied["status"] == "denied"
    await db_session.refresh(user)
    assert user.twofa_method == "telegram"
