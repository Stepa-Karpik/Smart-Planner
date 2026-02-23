from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.enums import RouteMode, UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("username must not be empty")
        return value


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    user_id: str
    email: str
    username: str
    display_name: str | None = None
    default_route_mode: RouteMode
    role: UserRole = UserRole.USER
    tokens: TokenPair
    requires_twofa: bool = False
