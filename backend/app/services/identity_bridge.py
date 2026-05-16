from dataclasses import dataclass

import httpx


@dataclass(frozen=True, slots=True)
class MintedBrowserSession:
    session_id: str
    subject_id: str


@dataclass(frozen=True, slots=True)
class IdentityBridge:
    """Compatibility bridge from planner's legacy auth to shared identity.

    Planner remains source-compatible with the current login flow while identity
    receives the same existing planner user UUID as ecosystem subject_id.
    """

    base_url: str
    internal_api_key: str = ""
    timeout_seconds: float = 2.0

    @property
    def exchange_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/v1/session-exchange"

    @property
    def internal_browser_sessions_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/v1/internal/browser-sessions"

    async def mint_browser_session(self, subject_id: str, email: str | None = None) -> MintedBrowserSession | None:
        if not self.base_url or not self.internal_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.internal_browser_sessions_url,
                    json={"subject_id": subject_id, "email": email},
                    headers={"x-internal-key": self.internal_api_key},
                )
                response.raise_for_status()
            return MintedBrowserSession(**response.json())
        except httpx.HTTPError:
            # SSO is additive during migration; legacy planner auth must keep working.
            return None
