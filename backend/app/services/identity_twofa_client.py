from __future__ import annotations

import httpx

from app.core.config import get_settings


class IdentityTwoFAClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.identity_base_url.rstrip('/')


    async def _request(self, method: str, path: str, *, json: dict | None = None) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10) as client:
            response = await client.request(
                method,
                path,
                headers={'x-internal-key': self.settings.identity_internal_api_key},
                json=json,
            )
            response.raise_for_status()
            return response.json()

    async def get_settings(self, *, subject_id: str) -> dict:
        return await self._request('GET', f'/api/v1/internal/accounts/{subject_id}/twofa')

    async def set_method(self, *, subject_id: str, method: str) -> dict:
        return await self._request('POST', f'/api/v1/internal/accounts/{subject_id}/twofa/method', json={'method': method})

    async def request_telegram_change(self, *, subject_id: str, action: str) -> dict:
        return await self._request('POST', f'/api/v1/internal/accounts/{subject_id}/twofa/telegram/{action}-request')

    async def get_pending_status(self, *, subject_id: str, pending_id: str) -> dict:
        return await self._request('GET', f'/api/v1/internal/accounts/{subject_id}/twofa/pending/{pending_id}')

    async def create_totp_setup(self, *, subject_id: str) -> dict:
        return await self._request('POST', f'/api/v1/internal/accounts/{subject_id}/twofa/totp/setup')

    async def verify_totp_setup(self, *, subject_id: str, pending_id: str, code: str) -> dict:
        return await self._request('POST', f'/api/v1/internal/accounts/{subject_id}/twofa/totp/verify-setup', json={'pending_id': pending_id, 'code': code})

    async def disable_totp(self, *, subject_id: str, code: str) -> dict:
        return await self._request('POST', f'/api/v1/internal/accounts/{subject_id}/twofa/totp/disable', json={'code': code})

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
