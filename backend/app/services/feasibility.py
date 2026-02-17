from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from app.core.config import get_settings
from app.core.enums import RouteMode
from app.models import Event
from app.services.routing import RoutePoint, RouteService


@dataclass(slots=True)
class FeasibilityConflict:
    prev_event_id: str | None
    prev_event_title: str | None
    next_event_id: str
    next_event_title: str
    current_start_at: str
    suggested_start_at: str
    suggested_end_at: str
    mode: RouteMode
    travel_time_sec: int
    reason: str
    faster_mode: RouteMode | None = None


class TravelFeasibilityService:
    def __init__(self, route_service: RouteService) -> None:
        self.route_service = route_service
        self.settings = get_settings()

    async def check(self, events: list[Event], mode: RouteMode) -> list[FeasibilityConflict]:
        if len(events) < 2:
            return []

        ordered = sorted(events, key=lambda item: item.start_at)
        conflicts: list[FeasibilityConflict] = []

        for prev_event, next_event in zip(ordered, ordered[1:]):
            if prev_event.location_lat is None or prev_event.location_lon is None:
                continue
            if next_event.location_lat is None or next_event.location_lon is None:
                continue

            route = await self.route_service.get_route_preview(
                from_point=RoutePoint(lat=prev_event.location_lat, lon=prev_event.location_lon),
                to_point=RoutePoint(lat=next_event.location_lat, lon=next_event.location_lon),
                mode=mode,
                departure=prev_event.end_at,
            )
            travel_delta = timedelta(seconds=route.duration_sec)
            buffer_delta = timedelta(minutes=self.settings.conflict_buffer_minutes)
            eta = prev_event.end_at + travel_delta + buffer_delta
            if eta <= next_event.start_at:
                continue

            faster_mode: RouteMode | None = None
            for candidate in [RouteMode.DRIVING, RouteMode.PUBLIC_TRANSPORT, RouteMode.BICYCLE, RouteMode.WALKING]:
                if candidate == mode:
                    continue
                candidate_route = await self.route_service.get_route_preview(
                    from_point=RoutePoint(lat=prev_event.location_lat, lon=prev_event.location_lon),
                    to_point=RoutePoint(lat=next_event.location_lat, lon=next_event.location_lon),
                    mode=candidate,
                    departure=prev_event.end_at,
                )
                if prev_event.end_at + timedelta(seconds=candidate_route.duration_sec) + buffer_delta <= next_event.start_at:
                    faster_mode = candidate
                    break

            shift = eta - next_event.start_at
            suggested_end = next_event.end_at + shift
            conflicts.append(
                FeasibilityConflict(
                    prev_event_id=str(prev_event.id),
                    prev_event_title=prev_event.title,
                    next_event_id=str(next_event.id),
                    next_event_title=next_event.title,
                    current_start_at=next_event.start_at.isoformat(),
                    suggested_start_at=eta.isoformat(),
                    suggested_end_at=suggested_end.isoformat(),
                    mode=mode,
                    travel_time_sec=route.duration_sec,
                    reason="insufficient travel time between neighboring events",
                    faster_mode=faster_mode,
                )
            )

        return conflicts
