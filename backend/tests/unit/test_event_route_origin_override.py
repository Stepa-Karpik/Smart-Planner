from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EVENT_MODEL = ROOT / "backend" / "app" / "models" / "event.py"
EVENT_SCHEMA = ROOT / "backend" / "app" / "schemas" / "event.py"
EVENT_SERVICE = ROOT / "backend" / "app" / "services" / "events.py"
EVENT_DETAIL = ROOT / "frontend" / "app" / "(dashboard)" / "events" / "[id]" / "page.tsx"
TYPES = ROOT / "frontend" / "lib" / "types.ts"
MIGRATION = ROOT / "backend" / "alembic" / "versions" / "0013_event_route_origin_home.py"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_backend_persists_route_origin_home_override():
    assert "route_origin_home" in read(EVENT_MODEL)
    assert "route_origin_home" in read(EVENT_SCHEMA)
    assert "\"route_origin_home\"" in read(EVENT_SERVICE)
    assert "op.add_column(\"events\"" in read(MIGRATION)


def test_event_detail_has_home_route_override_button_and_context_source():
    source = read(EVENT_DETAIL)
    types = read(TYPES)

    assert "route_origin_home" in types
    assert "handleUseHomeRouteOrigin" in source
    assert "canUseHomeRouteOrigin" in source
    assert "findRouteSourceForEvent" in source
    assert "findActiveLongEvent" in source
    assert "Я дома" in source
