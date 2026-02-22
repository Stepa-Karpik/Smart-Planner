from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import struct
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import quote
from uuid import UUID, uuid4

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards import twofa_login_keyboard, twofa_settings_keyboard
from app.core.config import get_settings
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationAppError
from app.integrations.telegram_client import get_bot
from app.repositories.telegram import TelegramRepository
from app.repositories.user import UserRepository

logger = logging.getLogger(__name__)

TwoFAMethod = Literal["none", "telegram", "totp"]
Decision = Literal["approve", "deny"]


class TwoFactorAuthService:
    PENDING_ACTION_TTL_SEC = 300
    TOTP_SETUP_TTL_SEC = 300
    LOGIN_SESSION_TTL_SEC = 600
    STATUS_GRACE_TTL_SEC = 3600
    LOGIN_MAX_ATTEMPTS = 5
    TOTP_DIGITS = 6
    TOTP_PERIOD_SEC = 30

    def __init__(self, session: AsyncSession, redis: Redis) -> None:
        self.session = session
        self.redis = redis
        self.settings = get_settings()
        self.users = UserRepository(session)
        self.telegram = TelegramRepository(session)

    async def get_user_twofa_settings(self, user_id: UUID) -> dict:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        link = await self.telegram.get_link_by_user(user_id)
        return {
            "twofa_method": self._normalize_method(user.twofa_method),
            "telegram_linked": bool(link and link.is_confirmed),
            "telegram_confirmed": bool(link and link.is_confirmed),
            "totp_enabled": bool(user.twofa_totp_secret and self._normalize_method(user.twofa_method) == "totp"),
        }

    async def request_telegram_method_change(self, user_id: UUID, action: Literal["enable", "disable"]) -> dict:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")

        link = await self.telegram.get_link_by_user(user_id)
        if link is None or not link.is_confirmed:
            raise ValidationAppError("Telegram account is not linked")
        if action == "enable" and self._normalize_method(user.twofa_method) == "telegram":
            raise ValidationAppError("Telegram 2FA is already enabled")
        if action == "disable" and self._normalize_method(user.twofa_method) != "telegram":
            raise ValidationAppError("Telegram 2FA is not enabled")

        now = self._now()
        expires_at = now + timedelta(seconds=self.PENDING_ACTION_TTL_SEC)
        pending_id = uuid4()
        payload = {
            "pending_id": str(pending_id),
            "user_id": str(user_id),
            "chat_id": int(link.telegram_chat_id),
            "method": "telegram",
            "action": action,
            "status": "pending",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
        await self._save_redis_json(self._pending_action_key(pending_id), payload, self.PENDING_ACTION_TTL_SEC)
        await self._send_telegram_settings_confirmation(
            chat_id=int(link.telegram_chat_id),
            action=action,
            pending_id=pending_id,
        )
        return payload

    async def get_pending_action_status(self, user_id: UUID, pending_id: UUID) -> dict:
        payload = await self._read_redis_json(self._pending_action_key(pending_id))
        if payload is None:
            return {
                "pending_id": str(pending_id),
                "method": "telegram",
                "action": "unknown",
                "status": "expired",
                "expires_at": None,
            }
        if payload.get("user_id") != str(user_id):
            raise UnauthorizedError("Pending action does not belong to user")
        payload = await self._finalize_expired_pending(payload, self._pending_action_key(pending_id))
        return payload

    async def confirm_telegram_method_change_from_callback(self, chat_id: int, pending_id: UUID, decision: Decision) -> dict:
        key = self._pending_action_key(pending_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            return {"status": "expired"}
        payload = await self._finalize_expired_pending(payload, key)
        if payload.get("status") != "pending":
            return payload
        if int(payload.get("chat_id", 0)) != int(chat_id):
            raise UnauthorizedError("Telegram chat mismatch")

        user = await self.users.get_by_id(UUID(str(payload["user_id"])))
        if user is None:
            raise NotFoundError("User not found")

        if decision == "deny":
            payload["status"] = "denied"
            await self._save_redis_json(key, payload, self.STATUS_GRACE_TTL_SEC)
            return payload

        now = self._now()
        action = payload.get("action")
        if action == "enable":
            await self.users.update_twofa(
                user,
                method="telegram",
                clear_totp_secret=True,
                clear_last_totp_step=True,
                telegram_enabled_at=now,
            )
        elif action == "disable":
            await self.users.update_twofa(user, method="none")
        else:
            raise ValidationAppError("Unknown action")

        await self.session.commit()
        payload["status"] = "approved"
        await self._save_redis_json(key, payload, self.STATUS_GRACE_TTL_SEC)
        return payload

    async def create_totp_setup(self, user_id: UUID) -> dict:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        pending_id = uuid4()
        now = self._now()
        expires_at = now + timedelta(seconds=self.TOTP_SETUP_TTL_SEC)
        secret = self._generate_totp_secret()
        payload = {
            "pending_id": str(pending_id),
            "user_id": str(user_id),
            "method": "totp",
            "secret": secret,
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "status": "pending",
        }
        await self._save_redis_json(self._totp_setup_key(pending_id), payload, self.TOTP_SETUP_TTL_SEC)
        return {
            "pending_id": str(pending_id),
            "secret": secret,
            "otpauth_uri": self._build_otpauth_uri(secret, user.email),
            "expires_at": expires_at,
        }

    async def verify_totp_setup(self, user_id: UUID, pending_id: UUID, code: str) -> None:
        key = self._totp_setup_key(pending_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            raise ValidationAppError("TOTP setup session expired")
        if payload.get("user_id") != str(user_id):
            raise UnauthorizedError("TOTP setup does not belong to user")
        if self._is_expired(payload):
            await self._mark_expired(key, payload)
            raise ValidationAppError("TOTP setup session expired")

        secret = str(payload.get("secret", ""))
        code_digits = self._normalize_code(code)
        ok, _ = self.verify_totp_code(secret, code_digits, now=self._now(), valid_window=1)
        if not ok:
            raise ValidationAppError("Invalid TOTP code")

        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        now = self._now()
        await self.users.update_twofa(
            user,
            method="totp",
            totp_secret=secret,
            totp_enabled_at=now,
            clear_last_totp_step=True,
        )
        await self.session.commit()
        await self.redis.delete(key)

    async def disable_totp(self, user_id: UUID, code: str) -> None:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        if self._normalize_method(user.twofa_method) != "totp" or not user.twofa_totp_secret:
            raise ValidationAppError("TOTP 2FA is not enabled")

        ok, matched_step = self.verify_totp_code(user.twofa_totp_secret, self._normalize_code(code), now=self._now(), valid_window=1)
        if not ok or matched_step is None:
            raise ValidationAppError("Invalid TOTP code")
        if user.twofa_last_totp_step is not None and matched_step <= int(user.twofa_last_totp_step):
            raise ValidationAppError("TOTP code already used")

        await self.users.update_twofa(
            user,
            method="none",
            clear_totp_secret=True,
            last_totp_step=matched_step,
        )
        await self.session.commit()

    async def create_login_twofa_session(self, user_id: UUID, method: TwoFAMethod) -> dict:
        if method not in {"telegram", "totp"}:
            raise ValidationAppError("Unsupported 2FA method")
        now = self._now()
        session_id = uuid4()
        expires_at = now + timedelta(seconds=self.LOGIN_SESSION_TTL_SEC)
        payload = {
            "twofa_session_id": str(session_id),
            "user_id": str(user_id),
            "twofa_method": method,
            "status": "pending",
            "attempts": 0,
            "sent_to_telegram": False,
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
        await self._save_redis_json(self._login_session_key(session_id), payload, self.LOGIN_SESSION_TTL_SEC)
        return {
            "requires_twofa": True,
            "twofa_method": method,
            "twofa_session_id": str(session_id),
            "expires_at": expires_at,
            "message": "Введите код из приложения" if method == "totp" else "Подтвердите вход в Telegram",
        }

    async def request_telegram_login_confirmation(self, twofa_session_id: UUID) -> dict:
        key = self._login_session_key(twofa_session_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            raise ValidationAppError("2FA session expired")
        payload = await self._finalize_expired_login_session(payload, key)
        if payload.get("status") != "pending":
            return payload
        if payload.get("twofa_method") != "telegram":
            raise ValidationAppError("2FA session is not telegram")

        user = await self.users.get_by_id(UUID(str(payload["user_id"])))
        if user is None:
            raise NotFoundError("User not found")
        link = await self.telegram.get_link_by_user(user.id)
        if link is None or not link.is_confirmed:
            raise ValidationAppError("Telegram account is not linked")

        await self._send_telegram_login_confirmation(int(link.telegram_chat_id), twofa_session_id)
        payload["sent_to_telegram"] = True
        await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
        return payload

    async def get_login_twofa_session_status(self, twofa_session_id: UUID) -> dict:
        key = self._login_session_key(twofa_session_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            raise ValidationAppError("2FA session expired")
        payload = await self._finalize_expired_login_session(payload, key)
        return payload

    async def verify_login_totp(self, twofa_session_id: UUID, code: str) -> UUID:
        key = self._login_session_key(twofa_session_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            raise ValidationAppError("2FA session expired")
        payload = await self._finalize_expired_login_session(payload, key)
        if payload.get("status") != "pending":
            raise ValidationAppError("2FA session is not pending")
        if payload.get("twofa_method") != "totp":
            raise ValidationAppError("2FA session is not totp")

        attempts = int(payload.get("attempts", 0)) + 1
        payload["attempts"] = attempts
        if attempts > self.LOGIN_MAX_ATTEMPTS:
            payload["status"] = "denied"
            await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
            raise ValidationAppError("Too many attempts")

        user = await self.users.get_by_id(UUID(str(payload["user_id"])))
        if user is None:
            raise NotFoundError("User not found")
        if self._normalize_method(user.twofa_method) != "totp" or not user.twofa_totp_secret:
            raise ValidationAppError("TOTP 2FA is not enabled")

        ok, matched_step = self.verify_totp_code(user.twofa_totp_secret, self._normalize_code(code), now=self._now(), valid_window=1)
        if not ok or matched_step is None:
            await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
            raise ValidationAppError("Invalid TOTP code")
        if user.twofa_last_totp_step is not None and matched_step <= int(user.twofa_last_totp_step):
            await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
            raise ValidationAppError("TOTP code already used")

        await self.users.update_twofa(user, last_totp_step=matched_step)
        await self.session.commit()

        payload["status"] = "used"
        await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
        return user.id

    async def complete_login_telegram(self, twofa_session_id: UUID) -> UUID:
        key = self._login_session_key(twofa_session_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            raise ValidationAppError("2FA session expired")
        payload = await self._finalize_expired_login_session(payload, key)
        if payload.get("twofa_method") != "telegram":
            raise ValidationAppError("2FA session is not telegram")
        if payload.get("status") != "approved":
            raise ValidationAppError("Telegram confirmation is not approved")

        payload["status"] = "used"
        await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
        return UUID(str(payload["user_id"]))

    async def confirm_login_telegram_from_callback(self, chat_id: int, twofa_session_id: UUID, decision: Decision) -> dict:
        key = self._login_session_key(twofa_session_id)
        payload = await self._read_redis_json(key)
        if payload is None:
            return {"status": "expired"}
        payload = await self._finalize_expired_login_session(payload, key)
        if payload.get("status") != "pending":
            return payload
        if payload.get("twofa_method") != "telegram":
            raise ValidationAppError("2FA session is not telegram")

        user = await self.users.get_by_id(UUID(str(payload["user_id"])))
        if user is None:
            raise NotFoundError("User not found")
        link = await self.telegram.get_link_by_user(user.id)
        if link is None or not link.is_confirmed or int(link.telegram_chat_id) != int(chat_id):
            raise UnauthorizedError("Telegram chat mismatch")

        payload["status"] = "approved" if decision == "approve" else "denied"
        await self._save_redis_json(key, payload, self._remaining_redis_ttl_for_status(payload))
        return payload

    async def _send_telegram_settings_confirmation(self, chat_id: int, action: str, pending_id: UUID) -> None:
        bot = get_bot()
        action_ru = "включить" if action == "enable" else "выключить"
        text = (
            "🔐 Запрос на изменение 2FA\n\n"
            f"Подтвердите действие: {action_ru} двухфакторную аутентификацию через Telegram."
        )
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            reply_markup=twofa_settings_keyboard(pending_id.hex),
        )

    async def _send_telegram_login_confirmation(self, chat_id: int, twofa_session_id: UUID) -> None:
        bot = get_bot()
        text = (
            "🔐 Попытка входа в Smart Planner\n\n"
            "Если это вы, подтвердите вход. Если нет — отклоните."
        )
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            reply_markup=twofa_login_keyboard(twofa_session_id.hex),
        )

    @classmethod
    def _pending_action_key(cls, pending_id: UUID) -> str:
        return f"twofa:pending:{pending_id}"

    @classmethod
    def _totp_setup_key(cls, pending_id: UUID) -> str:
        return f"twofa:totp-setup:{pending_id}"

    @classmethod
    def _login_session_key(cls, session_id: UUID) -> str:
        return f"twofa:login-session:{session_id}"

    async def _save_redis_json(self, key: str, payload: dict, logical_ttl_sec: int) -> None:
        ttl = int(logical_ttl_sec + self.STATUS_GRACE_TTL_SEC)
        await self.redis.setex(key, ttl, json.dumps(payload, separators=(",", ":")))

    async def _read_redis_json(self, key: str) -> dict | None:
        raw = await self.redis.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in redis key %s", key)
            return None

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _parse_dt(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    def _is_expired(self, payload: dict) -> bool:
        expires_at = self._parse_dt(payload.get("expires_at"))
        if expires_at is None:
            return True
        return expires_at <= self._now()

    async def _mark_expired(self, key: str, payload: dict) -> None:
        payload["status"] = "expired"
        await self._save_redis_json(key, payload, 60)

    async def _finalize_expired_pending(self, payload: dict, key: str) -> dict:
        if payload.get("status") == "pending" and self._is_expired(payload):
            payload["status"] = "expired"
            await self._save_redis_json(key, payload, 60)
        return payload

    async def _finalize_expired_login_session(self, payload: dict, key: str) -> dict:
        if payload.get("status") == "pending" and self._is_expired(payload):
            payload["status"] = "expired"
            await self._save_redis_json(key, payload, 60)
        return payload

    def _remaining_redis_ttl_for_status(self, payload: dict) -> int:
        expires_at = self._parse_dt(payload.get("expires_at"))
        if expires_at is None:
            return 60
        remaining = int(max(0, (expires_at - self._now()).total_seconds()))
        return max(60, remaining)

    @staticmethod
    def _normalize_method(value: str | None) -> str:
        normalized = (value or "none").strip().lower()
        if normalized not in {"none", "telegram", "totp"}:
            return "none"
        return normalized

    @classmethod
    def _normalize_code(cls, code: str) -> str:
        digits = "".join(ch for ch in str(code) if ch.isdigit())
        if len(digits) != cls.TOTP_DIGITS:
            raise ValidationAppError("TOTP code must contain 6 digits")
        return digits

    @staticmethod
    def _generate_totp_secret() -> str:
        secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
        return secret

    def _build_otpauth_uri(self, secret: str, account_name: str) -> str:
        issuer = self.settings.project_name or "Smart Planner"
        label = f"{issuer}:{account_name}"
        return (
            f"otpauth://totp/{quote(label)}"
            f"?secret={quote(secret)}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period={self.TOTP_PERIOD_SEC}"
        )

    @classmethod
    def _base32_secret_bytes(cls, secret: str) -> bytes:
        normalized = "".join(ch for ch in secret.strip().upper() if ch.isalnum())
        padding = "=" * ((8 - len(normalized) % 8) % 8)
        try:
            return base64.b32decode(normalized + padding, casefold=True)
        except Exception as exc:  # noqa: BLE001
            raise ValidationAppError("Invalid TOTP secret") from exc

    @classmethod
    def _hotp(cls, secret: str, counter: int, digits: int = 6) -> str:
        key = cls._base32_secret_bytes(secret)
        counter_bytes = struct.pack(">Q", counter)
        digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
        return str(code_int % (10**digits)).zfill(digits)

    @classmethod
    def current_totp_step(cls, now: datetime | None = None) -> int:
        current = now or datetime.now(timezone.utc)
        ts = int(current.timestamp())
        return ts // cls.TOTP_PERIOD_SEC

    @classmethod
    def verify_totp_code(
        cls,
        secret: str,
        code: str,
        *,
        now: datetime | None = None,
        valid_window: int = 1,
    ) -> tuple[bool, int | None]:
        current = now or datetime.now(timezone.utc)
        current_step = cls.current_totp_step(current)
        for step in range(current_step - valid_window, current_step + valid_window + 1):
            if step < 0:
                continue
            if cls._hotp(secret, step, digits=cls.TOTP_DIGITS) == code:
                return True, step
        return False, None
