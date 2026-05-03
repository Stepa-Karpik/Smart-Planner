from pathlib import Path

from app.services.ai.service import AIService


ROOT = Path(__file__).resolve().parents[3]
AI_PAGE = ROOT / "frontend" / "app" / "(dashboard)" / "ai" / "page.tsx"


def test_ai_sidebar_does_not_show_session_technical_id_or_old_header():
    source = AI_PAGE.read_text(encoding="utf-8")

    assert "session.id.slice" not in source
    assert "Session #" not in source
    assert "Сессия #" not in source
    assert "showModeHint" not in source


def test_ai_empty_chat_keeps_mode_selector_in_empty_state():
    source = AI_PAGE.read_text(encoding="utf-8")

    assert "uiMessages.length === 0" in source
    assert "ToggleGroup" in source
    assert "handleModeChange" in source


def test_ai_session_title_is_short_and_based_on_first_message():
    title = AIService._derive_session_title("Создай встречу с Иваном завтра в 10", "ru")

    assert len(title) <= 48
    assert len(title.split()) <= 4
    assert "создай" not in title.lower()
    assert title


def test_ai_session_title_normalizes_joke_request():
    assert AIService._derive_session_title("расскажи анедот бро", "ru") == "Анекдот"


def test_ai_delete_endpoint_returns_simple_deleted_payload():
    source = (ROOT / "backend" / "app" / "api" / "v1" / "endpoints" / "ai.py").read_text(encoding="utf-8")

    assert 'data={"id": str(session_id), "deleted": True}' in source
