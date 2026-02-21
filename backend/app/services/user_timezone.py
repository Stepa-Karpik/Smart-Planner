from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import get_settings

try:
    from timezonefinder import TimezoneFinder
except Exception:  # pragma: no cover - optional dependency runtime fallback
    TimezoneFinder = None  # type: ignore[assignment]


class UserTimezoneService:
    _finder = TimezoneFinder(in_memory=True) if TimezoneFinder else None

    @classmethod
    def default_timezone_name(cls) -> str:
        settings = get_settings()
        return (getattr(settings, "default_user_timezone", None) or "Europe/Moscow").strip() or "Europe/Moscow"

    @classmethod
    def resolve_timezone_name(cls, user: Any) -> str:
        fallback = cls.default_timezone_name()
        if user is None:
            return fallback

        lat = getattr(user, "home_location_lat", None)
        lon = getattr(user, "home_location_lon", None)
        try:
            lat_value = float(lat) if lat is not None else None
            lon_value = float(lon) if lon is not None else None
        except Exception:
            lat_value = None
            lon_value = None

        if lat_value is None or lon_value is None:
            return fallback

        timezone_name: str | None = None
        finder = cls._finder
        if finder is not None:
            try:
                timezone_name = finder.timezone_at(lat=lat_value, lng=lon_value)
            except Exception:
                timezone_name = None
            if timezone_name is None and hasattr(finder, "closest_timezone_at"):
                try:
                    timezone_name = finder.closest_timezone_at(lat=lat_value, lng=lon_value)  # type: ignore[attr-defined]
                except Exception:
                    timezone_name = None

        if not timezone_name:
            return fallback

        try:
            ZoneInfo(timezone_name)
            return timezone_name
        except Exception:
            return fallback

    @classmethod
    def now_local(cls, user: Any) -> tuple[str, datetime]:
        timezone_name = cls.resolve_timezone_name(user)
        return timezone_name, datetime.now(ZoneInfo(timezone_name))

    @classmethod
    def to_local(cls, dt_value: datetime, timezone_name: str) -> datetime:
        aware = dt_value if dt_value.tzinfo else dt_value.replace(tzinfo=timezone.utc)
        return aware.astimezone(ZoneInfo(timezone_name))

