from __future__ import annotations

import abc
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import get_settings


@dataclass(slots=True)
class AIProviderResult:
    text: str
    provider: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0


class AIProvider(abc.ABC):
    @abc.abstractmethod
    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> AIProviderResult:
        raise NotImplementedError

    async def transcribe(self, audio_bytes: bytes, filename: str) -> str:
        return ""


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, timeout_ms: int = 20000) -> None:
        self.api_key = api_key
        self.timeout = timeout_ms / 1000
        self.base_url = "https://api.openai.com/v1"

    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> AIProviderResult:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt or "You are a helpful planning assistant."}
        ]
        if history:
            for item in history:
                role = item.get("role", "")
                content = item.get("content", "")
                if role in {"user", "assistant"} and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})
        body = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=body)
        response.raise_for_status()
        payload = response.json()
        text = payload["choices"][0]["message"]["content"]
        usage = payload.get("usage", {})
        return AIProviderResult(
            text=text,
            provider="openai",
            model=payload.get("model", "gpt-4o-mini"),
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
        )

    async def transcribe(self, audio_bytes: bytes, filename: str) -> str:
        headers = {"Authorization": f"Bearer {self.api_key}"}

        ext = Path(filename).suffix.lower()
        mime = {
            ".ogg": "audio/ogg",
            ".oga": "audio/ogg",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".webm": "audio/webm",
        }.get(ext, "application/octet-stream")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for model_name in ("gpt-4o-mini-transcribe", "whisper-1"):
                files = {"file": (filename, audio_bytes, mime)}
                data = {"model": model_name}
                try:
                    response = await client.post(
                        f"{self.base_url}/audio/transcriptions",
                        headers=headers,
                        data=data,
                        files=files,
                    )
                    response.raise_for_status()
                except httpx.HTTPStatusError:
                    continue

                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    payload = response.json()
                    text = payload.get("text", "")
                else:
                    text = response.text
                if text and text.strip():
                    return text.strip()

        return ""


class DeepSeekProvider(AIProvider):
    def __init__(self, api_key: str, timeout_ms: int = 20000) -> None:
        self.api_key = api_key
        self.timeout = timeout_ms / 1000
        self.base_url = "https://api.deepseek.com/v1"

    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> AIProviderResult:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt or "You are a helpful planning assistant."}
        ]
        if history:
            for item in history:
                role = item.get("role", "")
                content = item.get("content", "")
                if role in {"user", "assistant"} and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})
        body = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=body)
        response.raise_for_status()
        payload = response.json()
        text = payload["choices"][0]["message"]["content"]
        usage = payload.get("usage", {})
        return AIProviderResult(
            text=text,
            provider="deepseek",
            model=payload.get("model", "deepseek-chat"),
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
        )


class MockProvider(AIProvider):
    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> AIProviderResult:
        return AIProviderResult(
            text=f"Mock AI response: {message[:200]}",
            provider="mock",
            model="mock-v1",
            tokens_in=0,
            tokens_out=0,
        )

    async def transcribe(self, audio_bytes: bytes, filename: str) -> str:
        return ""


def build_providers() -> dict[str, AIProvider]:
    settings = get_settings()
    providers: dict[str, AIProvider] = {}
    if settings.openai_api_key:
        providers["openai"] = OpenAIProvider(settings.openai_api_key, timeout_ms=settings.ai_timeout_ms)
    if settings.deepseek_api_key:
        providers["deepseek"] = DeepSeekProvider(settings.deepseek_api_key, timeout_ms=settings.ai_timeout_ms)
    if not providers:
        providers["mock"] = MockProvider()
    return providers
