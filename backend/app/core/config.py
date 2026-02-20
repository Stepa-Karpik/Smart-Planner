import json
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    env: Literal["dev", "prod"] = "dev"
    project_name: str = "Smart Planner"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://planner:planner@postgres:5432/planner"
    redis_url: str = "redis://redis:6379/0"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 30
    jwt_refresh_ttl_days: int = 14

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""

    app_base_url: str = "http://localhost:3000"
    frontend_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    admin_usernames: list[str] = Field(default_factory=list)

    worker_poll_interval_sec: int = 10
    notif_lock_ttl_sec: int = 600
    conflict_horizon_hours: int = 4
    conflict_buffer_minutes: int = 5

    yandex_router_api_key: str = ""
    yandex_maps_api_key: str = ""
    yandex_geocoder_api_key: str = ""

    city_pt_fare: float = 65.0
    car_cost_per_km: float = 12.0
    weight_time: float = 0.7
    weight_cost: float = 0.3

    ai_default_provider: Literal["openai", "deepseek"] = "openai"
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    ai_timeout_ms: int = 20000
    ai_max_concurrency: int = 8
    ai_assistant_base_url: str = "http://ai-assistant:8100"
    ai_assistant_timeout_ms: int = 10000
    ai_assistant_retries: int = 2
    ai_assistant_circuit_breaker_failures: int = 5
    ai_assistant_circuit_breaker_reset_sec: int = 30
    ai_assistant_internal_api_key: str = ""
    ai_context_window_messages: int = 16
    ai_context_summary_max_chars: int = 1200

    routes_cache_ttl_sec: int = 900
    geocode_cache_ttl_sec: int = 1800
    route_request_timeout_sec: int = 8
    route_retry_attempts: int = 3
    route_retry_backoff_sec: float = 0.5

    telegram_start_ttl_min: int = 15
    plan_digest_cache_ttl_sec: int = 60

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            if not value.strip():
                return []
            if value.strip().startswith("["):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [str(origin).strip() for origin in parsed if str(origin).strip()]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []

    @field_validator("admin_usernames", mode="before")
    @classmethod
    def parse_admin_usernames(cls, value: object) -> list[str]:
        if isinstance(value, str):
            if not value.strip():
                return []
            if value.strip().startswith("["):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [str(item).strip().lower() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [str(item).strip().lower() for item in value if str(item).strip()]
        return []


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
