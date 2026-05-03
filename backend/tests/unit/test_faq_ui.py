from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FAQ_PAGE = ROOT / "frontend" / "app" / "(dashboard)" / "support" / "faq" / "page.tsx"
FAQ_DATA = ROOT / "frontend" / "lib" / "support-faq.ts"


def test_faq_uses_categorized_accordion_ui():
    page = FAQ_PAGE.read_text(encoding="utf-8")
    data = FAQ_DATA.read_text(encoding="utf-8")

    assert "SUPPORT_FAQ_CATEGORIES" in page
    assert "Accordion" in page
    assert "Ассистент" in data
    assert "Тикеты" in data
    assert "Диаграммы ганта" in data
    assert "2FA и вход" in data


def test_faq_light_theme_does_not_use_old_black_white_panel_styles():
    page = FAQ_PAGE.read_text(encoding="utf-8")

    assert "bg-black/30" not in page
    assert "text-white/55" not in page
    assert "border-white/10" not in page
