from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    env: Literal["dev", "prod"] = "dev"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://planner:planner@postgres:5432/planner"

    model_provider: Literal["openai", "deepseek", "mock"] = "openai"
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    model_timeout_ms: int = 12000
    model_retries: int = 2
    circuit_breaker_failures: int = 5
    circuit_breaker_reset_sec: int = 30

    internal_api_key: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
