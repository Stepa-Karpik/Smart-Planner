from __future__ import annotations

import httpx

from app.core.config import get_settings


class IdentityTwoFAClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.identity_base_url.rstrip('/')

    async def telegram_callback(self, *, chat_id: int, twofa_session_id: str, decision: str) -> dict:
        if not self.base_url:
            return {'status': 'expired'}
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10) as client:
            response = await client.post(
                '/api/v1/internal/twofa/telegram/callback',
                headers={'x-internal-key': self.settings.identity_internal_api_key},
                json={'chat_id': chat_id, 'twofa_session_id': twofa_session_id, 'decision': decision},
            )
            response.raise_for_status()
            return response.json()
