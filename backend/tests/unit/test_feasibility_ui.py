from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FEASIBILITY_PAGE = ROOT / "frontend" / "app" / "(dashboard)" / "feasibility" / "page.tsx"


def test_feasibility_conflicts_have_direct_actions():
    source = FEASIBILITY_PAGE.read_text(encoding="utf-8")

    assert "handleRescheduleConflict" in source
    assert "handleCancelConflictEvent" in source
    assert "next_event_id" in source
    assert "prev_event_id" in source
    assert "updateEvent" in source


def test_feasibility_uses_cards_not_old_table():
    source = FEASIBILITY_PAGE.read_text(encoding="utf-8")

    assert "TableHeader" not in source
    assert "Conflict pair" in source or "Пара событий" in source
