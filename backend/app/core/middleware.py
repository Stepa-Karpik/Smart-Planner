from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import insert
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.db.session import SessionLocal
from app.models.api_metric import ApiRequestMetric



def _service_from_request(request: Request) -> str:
    explicit = request.headers.get("X-Nerior-Service")
    if explicit:
        return explicit.strip().lower()[:40] or "unknown"
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    for service in ("planner", "documents", "admin", "auth", "finance", "habits"):
        if f"{service}." in origin:
            return service
    path = request.url.path.lower()
    if path.startswith("/api/v1/admin"):
        return "admin"
    if "document" in path:
        return "documents"
    return "planner"


class ApiMetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        path = request.url.path
        if not path.endswith("/healthz") and not path.endswith("/metrics"):
            duration_ms = max(0, int((time.perf_counter() - started) * 1000))
            try:
                async with SessionLocal() as session:
                    await session.execute(insert(ApiRequestMetric).values(
                        id=uuid.uuid4(),
                        service=_service_from_request(request),
                        method=request.method[:12],
                        path=path[:512],
                        status_code=response.status_code,
                        duration_ms=duration_ms,
                        created_at=datetime.now(timezone.utc),
                    ))
                    await session.commit()
            except Exception:
                pass
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
