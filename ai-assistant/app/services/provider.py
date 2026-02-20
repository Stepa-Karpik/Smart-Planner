from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx

from app.config import get_settings


class ProviderError(RuntimeError):
    pass


class ProviderCircuitBreaker:
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


class LLMProvider:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.timeout_sec = self.settings.model_timeout_ms / 1000
        self.retries = max(0, self.settings.model_retries)
        self.breaker = ProviderCircuitBreaker(
            failures_threshold=self.settings.circuit_breaker_failures,
            reset_seconds=self.settings.circuit_breaker_reset_sec,
        )

    async def _post_chat_json(self, *, url: str, body: dict, headers: dict[str, str]) -> dict:
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                response = await client.post(url, json=body, headers=headers)
        except httpx.TimeoutException as exc:
            raise ProviderError(f"timeout:{exc}") from exc
        except httpx.NetworkError as exc:
            raise ProviderError(f"provider_error:network:{exc}") from exc
        except Exception as exc:
            raise ProviderError(f"provider_error:request_failed:{exc}") from exc

        if response.status_code == 429:
            raise ProviderError(f"rate_limit:http_429:{response.text[:240]}")
        if response.status_code >= 500:
            raise ProviderError(f"provider_error:http_{response.status_code}")
        if response.status_code >= 400:
            raise ProviderError(f"provider_error:http_{response.status_code}:{response.text[:240]}")

        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise ProviderError("provider_error:invalid_json") from exc

        if not isinstance(payload, dict):
            raise ProviderError("provider_error:invalid_payload")
        return payload

    async def _openai_chat(self, prompt: str) -> str:
        if not self.settings.openai_api_key:
            raise ProviderError("provider_error:openai_key_missing")

        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "You are a concise helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload = await self._post_chat_json(
            url="https://api.openai.com/v1/chat/completions",
            body=body,
            headers=headers,
        )
        return str(payload["choices"][0]["message"]["content"]).strip()

    async def _deepseek_chat(self, prompt: str) -> str:
        if not self.settings.deepseek_api_key:
            raise ProviderError("provider_error:deepseek_key_missing")

        body = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": "You are a concise helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        payload = await self._post_chat_json(
            url="https://api.deepseek.com/v1/chat/completions",
            body=body,
            headers=headers,
        )
        return str(payload["choices"][0]["message"]["content"]).strip()

    async def _chat_once(self, prompt: str) -> str:
        provider = self.settings.model_provider
        if provider == "mock":
            return f"Mock response: {prompt[:220]}"
        if provider == "deepseek":
            return await self._deepseek_chat(prompt)
        return await self._openai_chat(prompt)

    async def chat(self, prompt: str) -> str:
        if self.breaker.is_open():
            raise ProviderError("provider_error:provider_circuit_open")

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                text = await self._chat_once(prompt)
                self.breaker.on_success()
                return text
            except ProviderError as exc:
                last_error = exc
                if attempt < self.retries:
                    await asyncio.sleep(0.2 * (2**attempt))
                    continue
                break
            except Exception as exc:
                last_error = ProviderError(f"provider_error:unexpected:{exc}")
                if attempt < self.retries:
                    await asyncio.sleep(0.2 * (2**attempt))
                    continue
                break

        self.breaker.on_failure()
        raise ProviderError(str(last_error or "provider_request_failed"))
