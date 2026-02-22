from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


TwoFAMethod = Literal["none", "telegram", "totp"]
TwoFAPendingStatus = Literal["pending", "approved", "denied", "expired"]
TwoFALoginStatus = Literal["pending", "approved", "denied", "expired", "used"]


class TwoFASettingsResponse(BaseModel):
    twofa_method: TwoFAMethod
    telegram_linked: bool
    telegram_confirmed: bool
    totp_enabled: bool


class TwoFATelegramPendingResponse(BaseModel):
    pending_id: str
    method: Literal["telegram"] = "telegram"
    action: Literal["enable", "disable"]
    status: TwoFAPendingStatus
    expires_at: datetime


class TwoFAPendingStatusResponse(BaseModel):
    pending_id: str
    method: str
    action: str
    status: TwoFAPendingStatus
    expires_at: datetime | None = None


class TotpSetupResponse(BaseModel):
    pending_id: str
    secret: str
    otpauth_uri: str
    expires_at: datetime


class TotpVerifySetupRequest(BaseModel):
    pending_id: UUID
    code: str = Field(min_length=6, max_length=16)


class TotpDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=16)


class LoginTwoFAChallenge(BaseModel):
    requires_twofa: Literal[True] = True
    twofa_method: Literal["telegram", "totp"]
    twofa_session_id: str
    expires_at: datetime
    message: str | None = None


class LoginTwoFATotpVerifyRequest(BaseModel):
    twofa_session_id: UUID
    code: str = Field(min_length=6, max_length=16)


class LoginTwoFATelegramSessionRequest(BaseModel):
    twofa_session_id: UUID


class LoginTwoFASessionStatusResponse(BaseModel):
    twofa_session_id: str
    twofa_method: Literal["telegram", "totp"]
    status: TwoFALoginStatus
    expires_at: datetime
    sent_to_telegram: bool = False
