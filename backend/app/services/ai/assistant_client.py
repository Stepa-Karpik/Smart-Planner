from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.ai_assistant import AIInterpretRequest, AIProposeRequest, AIResultEnvelope


class AssistantClientError(RuntimeError):
    pass


class CircuitBreaker:
    def __init__(self, failures_threshold: int, reset_seconds: int) -> None:
        self.failures_threshold = max(1, failures_threshold)
        self.reset_seconds = max(1, reset_seconds)
        self.failures = 0
        self.opened_until: datetime | None = None

    def is_open(self) -> bool:
        if self.opened_until is None:
            return False
        if datetime.now(timezone.utc) >= self.opened_until:
            self.failures = 0
            self.opened_until = None
            return False
        return True

    def on_success(self) -> None:
        self.failures = 0
        self.opened_until = None

    def on_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failures_threshold:
            self.opened_until = datetime.now(timezone.utc) + timedelta(seconds=self.reset_seconds)


class AIAssistantClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.ai_assistant_base_url.rstrip("/")
        self.timeout = settings.ai_assistant_timeout_ms / 1000
        self.retries = max(0, settings.ai_assistant_retries)
        self._api_key = settings.ai_assistant_internal_api_key
        self._breaker = CircuitBreaker(
            failures_threshold=settings.ai_assistant_circuit_breaker_failures,
            reset_seconds=settings.ai_assistant_circuit_breaker_reset_sec,
        )
        self._health_cache_ttl_sec = 5
        self._health_cached_at: datetime | None = None
        self._health_cached_ok: bool | None = None

    @property
    def breaker_open(self) -> bool:
        return self._breaker.is_open()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["X-Internal-API-Key"] = self._api_key
        return headers

    async def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self._breaker.is_open():
            raise AssistantClientError("ai_assistant_circuit_open")

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.base_url}{path}",
                        headers=self._headers(),
                        json=payload,
                    )

                if response.status_code >= 500:
                    raise AssistantClientError(f"ai_assistant_http_{response.status_code}")
                if response.status_code >= 400:
                    detail = response.text.strip()[:500]
                    raise AssistantClientError(f"ai_assistant_http_{response.status_code}:{detail}")

                data = response.json()
                if not isinstance(data, dict):
                    raise AssistantClientError("ai_assistant_invalid_json")

                self._breaker.on_success()
                return data
            except (httpx.TimeoutException, httpx.NetworkError, AssistantClientError, ValueError) as exc:
                last_error = exc
                if attempt < self.retries:
                    await asyncio.sleep(0.2 * (2**attempt))
                    continue
                break

        self._breaker.on_failure()
        raise AssistantClientError(str(last_error or "ai_assistant_request_failed"))

    async def is_healthy(self, *, force: bool = False) -> bool:
        now = datetime.now(timezone.utc)
        if (
            not force
            and self._health_cached_at is not None
            and (now - self._health_cached_at).total_seconds() < self._health_cache_ttl_sec
            and self._health_cached_ok is not None
        ):
            return self._health_cached_ok

        if self._breaker.is_open():
            self._health_cached_at = now
            self._health_cached_ok = False
            return False

        try:
            async with httpx.AsyncClient(timeout=min(self.timeout, 3.0)) as client:
                response = await client.get(
                    f"{self.base_url}/health",
                    headers=self._headers(),
                )
            if response.status_code != 200:
                raise AssistantClientError(f"ai_assistant_health_http_{response.status_code}")

            payload = response.json()
            status = str(payload.get("status", "")).lower() if isinstance(payload, dict) else ""
            healthy = status == "ok"
            self._health_cached_at = now
            self._health_cached_ok = healthy
            if healthy:
                self._breaker.on_success()
                return True
            self._breaker.on_failure()
            return False
        except Exception:
            self._breaker.on_failure()
            self._health_cached_at = now
            self._health_cached_ok = False
            return False

    async def interpret(self, payload: AIInterpretRequest) -> AIResultEnvelope:
        data = await self._post_json("/v1/ai/interpret", payload.model_dump(mode="json"))
        return AIResultEnvelope.model_validate(data)

    async def propose(self, payload: AIProposeRequest) -> AIResultEnvelope:
        data = await self._post_json("/v1/ai/propose", payload.model_dump(mode="json"))
        return AIResultEnvelope.model_validate(data)
