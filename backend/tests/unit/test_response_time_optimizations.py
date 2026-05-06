from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_geocode_and_route_cache_ttls_are_long_enough_for_server_reuse():
    config = read("backend/app/core/config.py")

    assert "routes_cache_ttl_sec: int = 3600" in config
    assert "geocode_cache_ttl_sec: int = 2592000" in config


def test_location_suggest_has_endpoint_level_redis_cache():
    routes = read("backend/app/api/v1/endpoints/routes.py")

    assert "location_suggest:merged" in routes
    assert "await redis.setex(cache_key" in routes
    assert "cached = await redis.get(cache_key)" in routes


def test_location_input_has_client_cache_and_deduplication():
    location_input = read("frontend/components/location-input.tsx")

    assert "LOCATION_CACHE_TTL_MS" in location_input
    assert "localStorage" in location_input
    assert "locationSuggestionInFlight" in location_input


def test_api_client_has_short_get_cache_and_invalidates_on_mutation():
    api_client = read("frontend/lib/api-client.ts")

    assert "GET_CACHE_TTL_MS" in api_client
    assert "responseCache.clear()" in api_client
    assert "inFlightGetRequests" in api_client


def test_database_has_indexes_for_slow_listing_pages():
    migration = read("backend/alembic/versions/0012_response_time_indexes.py")

    assert "ix_events_status_start_not_deleted" in migration
    assert "ix_feed_items_published_created" in migration
    assert "ix_support_tickets_user_updated" in migration
    assert "ix_support_tickets_status_updated" in migration
