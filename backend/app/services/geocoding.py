from __future__ import annotations

import asyncio
import abc
import json
import logging
from dataclasses import asdict, dataclass

import httpx

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.enums import EventLocationSource

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GeoPoint:
    lat: float
    lon: float


@dataclass(slots=True)
class GeoSuggestion:
    title: str
    subtitle: str | None
    lat: float
    lon: float


@dataclass(slots=True)
class GeoSuggestionCandidate:
    title: str
    subtitle: str | None

    @property
    def query_text(self) -> str:
        if self.subtitle:
            return f"{self.title}, {self.subtitle}"
        return self.title


class GeoProvider(abc.ABC):
    @abc.abstractmethod
    async def geocode(self, location_text: str) -> GeoPoint | None:
        raise NotImplementedError

    @abc.abstractmethod
    async def suggest(self, query: str, limit: int = 8) -> list[GeoSuggestion]:
        raise NotImplementedError

    @abc.abstractmethod
    async def reverse_geocode(self, lat: float, lon: float) -> str | None:
        raise NotImplementedError


class StubGeoProvider(GeoProvider):
    _seed = [
        GeoSuggestion("Ростов-на-Дону", "Ростовская область, Россия", 47.2357, 39.7015),
        GeoSuggestion("Ростов Великий", "Ярославская область, Россия", 57.1914, 39.4139),
        GeoSuggestion("с. Ростовка", "Омская область, Россия", 54.9938, 73.1794),
        GeoSuggestion("Москва, Кремль", "Россия", 55.7520, 37.6175),
        GeoSuggestion("Санкт-Петербург, Невский проспект", "Россия", 59.9343, 30.3351),
    ]

    async def geocode(self, location_text: str) -> GeoPoint | None:
        normalized = location_text.strip().lower()
        if not normalized:
            return None
        for item in self._seed:
            if normalized in item.title.lower():
                return GeoPoint(lat=item.lat, lon=item.lon)
        return None

    async def suggest(self, query: str, limit: int = 8) -> list[GeoSuggestion]:
        normalized = query.strip().lower()
        if not normalized:
            return []
        matched = [
            item
            for item in self._seed
            if normalized in item.title.lower() or (item.subtitle and normalized in item.subtitle.lower())
        ]
        return matched[:limit]

    async def reverse_geocode(self, lat: float, lon: float) -> str | None:
        if not self._seed:
            return None
        nearest = min(self._seed, key=lambda item: abs(item.lat - lat) + abs(item.lon - lon))
        return nearest.title


class YandexGeoProvider(GeoProvider):
    def __init__(self, api_key: str, timeout_sec: int = 8) -> None:
        self.api_key = api_key
        self.timeout_sec = timeout_sec
        self.base_geocode_url = "https://geocode-maps.yandex.ru/1.x"
        self.base_suggest_url = "https://suggest-maps.yandex.ru/v1/suggest"

    async def _geocode_request(self, geocode: str, results: int = 1) -> dict:
        params = {
            "apikey": self.api_key,
            "format": "json",
            "geocode": geocode,
            "results": results,
            "lang": "ru_RU",
        }
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.get(self.base_geocode_url, params=params)
            response.raise_for_status()
            return response.json()

    async def _suggest_request(self, text: str, results: int = 8) -> dict:
        params = {
            "apikey": self.api_key,
            "text": text,
            "lang": "ru_RU",
            "results": results,
        }
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.get(self.base_suggest_url, params=params)
            response.raise_for_status()
            return response.json()

    @staticmethod
    def _is_unavailable_error(exc: httpx.HTTPStatusError) -> bool:
        return exc.response.status_code in {401, 403, 429}

    @staticmethod
    def _extract_title_subtitle(item: dict) -> tuple[str | None, str | None]:
        raw_title = item.get("title")
        raw_subtitle = item.get("subtitle")

        title = raw_title.get("text") if isinstance(raw_title, dict) else raw_title
        subtitle = raw_subtitle.get("text") if isinstance(raw_subtitle, dict) else raw_subtitle
        normalized_title = str(title).strip() if title else None
        normalized_subtitle = str(subtitle).strip() if subtitle else None
        return normalized_title, normalized_subtitle

    @staticmethod
    def _parse_geocode_features(payload: dict) -> list[GeoSuggestion]:
        members = (
            payload.get("response", {})
            .get("GeoObjectCollection", {})
            .get("featureMember", [])
        )
        result: list[GeoSuggestion] = []
        for member in members:
            geo = member.get("GeoObject", {})
            point = geo.get("Point", {}).get("pos", "")
            try:
                lon_str, lat_str = point.split()
                lon = float(lon_str)
                lat = float(lat_str)
            except Exception:
                continue

            title = geo.get("name") or geo.get("metaDataProperty", {}).get("GeocoderMetaData", {}).get("text") or ""
            subtitle = geo.get("description")
            if title:
                result.append(GeoSuggestion(title=title, subtitle=subtitle, lat=lat, lon=lon))
        return result

    @staticmethod
    def _parse_suggest_results(payload: dict) -> list[GeoSuggestion]:
        result: list[GeoSuggestion] = []
        items = payload.get("results", [])
        for item in items:
            title, subtitle = YandexGeoProvider._extract_title_subtitle(item)
            if not title:
                continue

            # suggest response may omit geometry; skip these to avoid unusable options
            lon = None
            lat = None
            if isinstance(item.get("center"), list) and len(item["center"]) == 2:
                lon = item["center"][0]
                lat = item["center"][1]
            if lon is None or lat is None:
                continue

            try:
                parsed_lat = float(lat)
                parsed_lon = float(lon)
            except (TypeError, ValueError):
                continue

            result.append(GeoSuggestion(title=title, subtitle=subtitle, lat=parsed_lat, lon=parsed_lon))
        return result

    @staticmethod
    def _parse_suggest_candidates(payload: dict, limit: int) -> list[GeoSuggestionCandidate]:
        result: list[GeoSuggestionCandidate] = []
        seen: set[tuple[str, str | None]] = set()
        items = payload.get("results", [])
        for item in items:
            title, subtitle = YandexGeoProvider._extract_title_subtitle(item)
            if not title:
                continue
            key = (title.lower(), subtitle.lower() if subtitle else None)
            if key in seen:
                continue
            seen.add(key)
            result.append(GeoSuggestionCandidate(title=title, subtitle=subtitle))
            if len(result) >= limit:
                break
        return result

    async def geocode(self, location_text: str) -> GeoPoint | None:
        try:
            payload = await self._geocode_request(location_text, results=1)
        except httpx.HTTPStatusError as exc:
            if self._is_unavailable_error(exc):
                return None
            raise
        suggestions = self._parse_geocode_features(payload)
        if not suggestions:
            return None
        top = suggestions[0]
        return GeoPoint(lat=top.lat, lon=top.lon)

    async def suggest_full(self, query: str, limit: int = 8) -> tuple[list[GeoSuggestion], list[GeoSuggestionCandidate]]:
        try:
            payload = await self._suggest_request(query, results=max(1, min(limit, 16)))
        except httpx.HTTPStatusError as exc:
            if self._is_unavailable_error(exc):
                return [], []
            raise
        suggestions = self._parse_suggest_results(payload)[:limit]
        candidates = self._parse_suggest_candidates(payload, limit=max(limit, 8))
        return suggestions, candidates

    async def suggest(self, query: str, limit: int = 8) -> list[GeoSuggestion]:
        suggestions, _ = await self.suggest_full(query, limit=limit)
        return suggestions

    async def suggest_text_candidates(self, query: str, limit: int = 8) -> list[GeoSuggestionCandidate]:
        _, candidates = await self.suggest_full(query, limit=limit)
        return candidates

    async def reverse_geocode(self, lat: float, lon: float) -> str | None:
        try:
            payload = await self._geocode_request(f"{lon},{lat}", results=1)
        except httpx.HTTPStatusError as exc:
            if self._is_unavailable_error(exc):
                return None
            raise
        suggestions = self._parse_geocode_features(payload)
        if not suggestions:
            return None
        return suggestions[0].title


class NominatimGeoProvider(GeoProvider):
    def __init__(self, timeout_sec: int = 8) -> None:
        self.timeout_sec = timeout_sec
        self.base_url = "https://nominatim.openstreetmap.org"
        self.user_agent = "SmartPlanner/1.0 (geocoder)"

    async def _search(self, query: str, limit: int = 8) -> list[dict]:
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": max(1, min(limit, 15)),
            "addressdetails": 1,
            "accept-language": "ru,en",
        }
        headers = {"User-Agent": self.user_agent}
        async with httpx.AsyncClient(timeout=self.timeout_sec, headers=headers) as client:
            response = await client.get(f"{self.base_url}/search", params=params)
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, list):
                return payload
            return []

    async def geocode(self, location_text: str) -> GeoPoint | None:
        items = await self._search(location_text, limit=1)
        if not items:
            return None
        item = items[0]
        return GeoPoint(lat=float(item["lat"]), lon=float(item["lon"]))

    async def suggest(self, query: str, limit: int = 8) -> list[GeoSuggestion]:
        items = await self._search(query, limit=limit)
        result: list[GeoSuggestion] = []
        for item in items:
            display_name = str(item.get("display_name", "")).strip()
            if not display_name:
                continue
            parts = [part.strip() for part in display_name.split(",") if part.strip()]
            title = parts[0] if parts else display_name
            subtitle = ", ".join(parts[1:]) if len(parts) > 1 else None
            result.append(
                GeoSuggestion(
                    title=title,
                    subtitle=subtitle,
                    lat=float(item["lat"]),
                    lon=float(item["lon"]),
                )
            )
        return result

    async def reverse_geocode(self, lat: float, lon: float) -> str | None:
        params = {
            "lat": lat,
            "lon": lon,
            "format": "jsonv2",
            "accept-language": "ru,en",
        }
        headers = {"User-Agent": self.user_agent}
        async with httpx.AsyncClient(timeout=self.timeout_sec, headers=headers) as client:
            response = await client.get(f"{self.base_url}/reverse", params=params)
            response.raise_for_status()
            payload = response.json()
        display_name = payload.get("display_name")
        if display_name:
            return str(display_name)
        return None


class GeocodingService:
    def __init__(self, redis: Redis, provider: GeoProvider | None = None) -> None:
        self.redis = redis
        self.settings = get_settings()
        self.yandex_provider: YandexGeoProvider | None = None

        if provider is not None:
            self.providers: list[GeoProvider] = [provider]
            if isinstance(provider, YandexGeoProvider):
                self.yandex_provider = provider
        else:
            providers: list[GeoProvider] = []
            if self.settings.yandex_geocoder_api_key:
                yandex_provider = YandexGeoProvider(
                    self.settings.yandex_geocoder_api_key,
                    timeout_sec=self.settings.route_request_timeout_sec,
                )
                providers.append(yandex_provider)
                self.yandex_provider = yandex_provider
            providers.append(NominatimGeoProvider(timeout_sec=self.settings.route_request_timeout_sec))
            providers.append(StubGeoProvider())
            self.providers = providers

    @staticmethod
    def _normalize_text(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalize_coords(lat: float, lon: float) -> tuple[float, float]:
        return round(lat, 5), round(lon, 5)

    async def _try_geocode(self, text: str, *, include_stub: bool = True) -> GeoPoint | None:
        for provider in self.providers:
            if not include_stub and isinstance(provider, StubGeoProvider):
                continue
            try:
                point = await provider.geocode(text)
                if point:
                    return point
            except Exception as exc:
                logger.warning("Geocode provider failed", extra={"provider": provider.__class__.__name__, "error": str(exc)})
        return None

    async def _resolve_yandex_text_suggestions(
        self,
        query: str,
        limit: int,
        *,
        candidates: list[GeoSuggestionCandidate] | None = None,
    ) -> list[GeoSuggestion]:
        if not self.yandex_provider:
            return []

        resolve_cap = max(3, min(limit, 4))
        if candidates is None:
            try:
                candidates = await self.yandex_provider.suggest_text_candidates(query, limit=resolve_cap)
            except Exception as exc:
                logger.warning(
                    "Suggest provider failed",
                    extra={"provider": self.yandex_provider.__class__.__name__, "error": str(exc)},
                )
                return []
        if not candidates:
            return []

        semaphore = asyncio.Semaphore(3)

        async def resolve_one(candidate: GeoSuggestionCandidate) -> tuple[GeoSuggestionCandidate, GeoPoint | None]:
            async with semaphore:
                try:
                    async with asyncio.timeout(3):
                        point = await self._try_geocode_with_cache(candidate.query_text, include_stub=False)
                except TimeoutError:
                    point = None
                return candidate, point

        resolved: list[GeoSuggestion] = []
        seen_coords: set[tuple[float, float]] = set()
        resolved_candidates = await asyncio.gather(*(resolve_one(candidate) for candidate in candidates), return_exceptions=True)
        for item in resolved_candidates:
            if isinstance(item, Exception):
                continue

            candidate, point = item
            if point is None:
                continue
            normalized = self._normalize_coords(point.lat, point.lon)
            if normalized in seen_coords:
                continue
            seen_coords.add(normalized)
            resolved.append(GeoSuggestion(title=candidate.title, subtitle=candidate.subtitle, lat=point.lat, lon=point.lon))
            if len(resolved) >= resolve_cap:
                break
        return resolved

    async def _try_geocode_with_cache(self, text: str, *, include_stub: bool = True) -> GeoPoint | None:
        normalized = self._normalize_text(text)
        if not normalized:
            return None

        key = f"geocode:point:{normalized}"
        cached = await self.redis.get(key)
        if cached:
            payload = json.loads(cached)
            return GeoPoint(lat=payload["lat"], lon=payload["lon"])

        point = await self._try_geocode(normalized, include_stub=include_stub)
        if point:
            await self.redis.setex(
                key,
                self.settings.geocode_cache_ttl_sec,
                json.dumps({"lat": point.lat, "lon": point.lon}),
            )
        return point

    async def _try_suggest(self, query: str, limit: int) -> list[GeoSuggestion]:
        stub_provider: StubGeoProvider | None = None
        merged: list[GeoSuggestion] = []
        seen: set[tuple[float, float]] = set()

        def append_unique(items: list[GeoSuggestion], cap: int) -> None:
            for item in items:
                key = self._normalize_coords(item.lat, item.lon)
                if key in seen:
                    continue
                seen.add(key)
                merged.append(item)
                if len(merged) >= cap:
                    return

        yandex_candidates: list[GeoSuggestionCandidate] = []
        if self.yandex_provider is not None:
            try:
                yandex_suggestions, yandex_candidates = await self.yandex_provider.suggest_full(query, limit=limit)
                append_unique(yandex_suggestions, limit)
            except Exception as exc:
                logger.warning(
                    "Suggest provider failed",
                    extra={"provider": self.yandex_provider.__class__.__name__, "error": str(exc)},
                )

            if len(merged) < limit:
                resolved_yandex = await self._resolve_yandex_text_suggestions(
                    query,
                    limit=limit - len(merged),
                    candidates=yandex_candidates,
                )
                append_unique(resolved_yandex, limit)

        for provider in self.providers:
            if len(merged) >= limit:
                break
            if isinstance(provider, StubGeoProvider):
                stub_provider = provider
                continue
            if isinstance(provider, YandexGeoProvider):
                continue
            try:
                suggestions = await provider.suggest(query, limit=limit)
                append_unique(suggestions, limit)
            except Exception as exc:
                logger.warning("Suggest provider failed", extra={"provider": provider.__class__.__name__, "error": str(exc)})

        if len(merged) < limit and stub_provider is not None:
            try:
                append_unique(await stub_provider.suggest(query, limit=limit), limit)
            except Exception as exc:
                logger.warning("Suggest provider failed", extra={"provider": stub_provider.__class__.__name__, "error": str(exc)})

        return merged[:limit]

    async def _try_reverse(self, lat: float, lon: float) -> str | None:
        for provider in self.providers:
            try:
                label = await provider.reverse_geocode(lat, lon)
                if label:
                    return label
            except Exception as exc:
                logger.warning("Reverse geocode provider failed", extra={"provider": provider.__class__.__name__, "error": str(exc)})
        return None

    async def geocode_with_cache(self, location_text: str) -> tuple[GeoPoint | None, EventLocationSource]:
        point = await self._try_geocode_with_cache(location_text, include_stub=True)
        if point is not None:
            return point, EventLocationSource.GEOCODED
        return None, EventLocationSource.MANUAL_TEXT

    async def suggest_with_cache(self, query: str, limit: int = 8) -> list[GeoSuggestion]:
        normalized = self._normalize_text(query)
        if len(normalized) < 2:
            return []

        key = f"geocode:suggest:{normalized}:{limit}"
        cached = await self.redis.get(key)
        if cached:
            payload = json.loads(cached)
            return [GeoSuggestion(**item) for item in payload]

        suggestions = await self._try_suggest(normalized, limit)
        await self.redis.setex(
            key,
            self.settings.geocode_cache_ttl_sec,
            json.dumps([asdict(item) for item in suggestions]),
        )
        return suggestions

    async def reverse_with_cache(self, lat: float, lon: float) -> str | None:
        norm_lat, norm_lon = self._normalize_coords(lat, lon)
        key = f"geocode:reverse:{norm_lat},{norm_lon}"
        cached = await self.redis.get(key)
        if cached:
            payload = json.loads(cached)
            return payload.get("label")

        label = await self._try_reverse(norm_lat, norm_lon)
        if label:
            await self.redis.setex(
                key,
                self.settings.geocode_cache_ttl_sec,
                json.dumps({"label": label}),
            )
        return label
