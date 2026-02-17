from __future__ import annotations

from dataclasses import dataclass

from app.core.config import get_settings
from app.core.enums import RouteMode
from app.services.routing import RouteResult


@dataclass(slots=True)
class RecommendationItem:
    mode: RouteMode
    duration_sec: int
    distance_m: int
    estimated_cost: float
    score: float
    reason: str


class MultiCriteriaRecommendationService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def estimate_cost(self, route: RouteResult) -> float:
        km = route.distance_m / 1000
        if route.mode == RouteMode.WALKING:
            return 0.0
        if route.mode == RouteMode.PUBLIC_TRANSPORT:
            return float(self.settings.city_pt_fare)
        if route.mode == RouteMode.DRIVING:
            return round(km * float(self.settings.car_cost_per_km), 2)
        if route.mode == RouteMode.BICYCLE:
            return 0.0
        return 0.0

    def rank(self, routes: list[RouteResult]) -> list[RecommendationItem]:
        if not routes:
            return []
        max_duration = max(route.duration_sec for route in routes) or 1
        max_cost = max(self.estimate_cost(route) for route in routes) or 1.0
        recommendations: list[RecommendationItem] = []

        for route in routes:
            cost = self.estimate_cost(route)
            duration_score = route.duration_sec / max_duration
            cost_score = cost / max_cost if max_cost else 0.0
            total = self.settings.weight_time * duration_score + self.settings.weight_cost * cost_score
            reason = f"time={route.duration_sec // 60}m, cost~{cost:.2f}"
            recommendations.append(
                RecommendationItem(
                    mode=route.mode,
                    duration_sec=route.duration_sec,
                    distance_m=route.distance_m,
                    estimated_cost=cost,
                    score=round(total, 4),
                    reason=reason,
                )
            )

        recommendations.sort(key=lambda item: item.score)
        return recommendations
