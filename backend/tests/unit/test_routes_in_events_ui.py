from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_routes_are_not_a_primary_navigation_destination():
    app_shell = read("frontend/components/app-shell.tsx")
    event_card = read("frontend/components/event-card.tsx")

    assert 'href: "/routes"' not in app_shell
    assert "`/routes?to=" not in event_card
    assert "Build route" not in event_card


def test_event_detail_owns_route_preview():
    event_detail = read("frontend/app/(dashboard)/events/[id]/page.tsx")

    assert "fetchRoutePreview" in event_detail
    assert "RoutePreviewMap" in event_detail
    assert "`/routes?to=" not in event_detail
