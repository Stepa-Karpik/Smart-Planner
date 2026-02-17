from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError


_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _create_token(subject: UUID, token_type: str, ttl_seconds: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        # Prevent collisions for tokens issued within the same second.
        "jti": str(uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()
    return _create_token(user_id, token_type="access", ttl_seconds=settings.jwt_access_ttl_min * 60)


def create_refresh_token(user_id: UUID) -> str:
    settings = get_settings()
    return _create_token(user_id, token_type="refresh", ttl_seconds=settings.jwt_refresh_ttl_days * 86400)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise UnauthorizedError("Invalid token") from exc
    return payload


def ensure_token_type(payload: dict[str, Any], expected: str) -> None:
    token_type = payload.get("type")
    if token_type != expected:
        raise UnauthorizedError("Invalid token type")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_telegram_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
