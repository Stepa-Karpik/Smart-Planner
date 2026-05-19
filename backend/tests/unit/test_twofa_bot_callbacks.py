from __future__ import annotations

import pytest

from app.bot.handlers import callbacks


class DummyChat:
    id = 123456789


class DummyMessage:
    def __init__(self) -> None:
        self.chat = DummyChat()
        self.edited_text: str | None = None

    async def edit_text(self, text: str) -> None:
        self.edited_text = text


class DummyCallback:
    def __init__(self, data: str) -> None:
        self.data = data
        self.message = DummyMessage()
        self.answers: list[tuple[str | None, bool | None]] = []

    async def answer(self, text: str | None = None, show_alert: bool | None = None) -> None:
        self.answers.append((text, show_alert))


@pytest.mark.asyncio
async def test_login_twofa_callback_passes_identity_session_id_without_uuid_parsing(monkeypatch):
    calls = []

    class DummyIdentityTwoFAClient:
        async def telegram_callback(self, *, chat_id: int, twofa_session_id: str, decision: str) -> dict:
            calls.append({"chat_id": chat_id, "twofa_session_id": twofa_session_id, "decision": decision})
            return {"status": "approved"}

    monkeypatch.setattr(callbacks, "IdentityTwoFAClient", DummyIdentityTwoFAClient)

    callback = DummyCallback("2fa:login:approve:tfa_deadbeef")
    await callbacks.twofa_actions(callback)  # type: ignore[arg-type]

    assert calls == [{"chat_id": 123456789, "twofa_session_id": "tfa_deadbeef", "decision": "approve"}]
    assert callback.message.edited_text == "Подтверждено ✅"
    assert callback.answers[-1] == (None, None)
