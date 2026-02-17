from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ResponseEnvelope(BaseModel):
    data: Any | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    error: ErrorBody | None = None


def build_meta(request: Request | None = None, pagination: dict[str, Any] | None = None) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
    if request is not None:
        request_id = getattr(request.state, "request_id", None)
        if request_id:
            meta["request_id"] = request_id
    if pagination:
        meta["pagination"] = pagination
    return meta


def success_response(data: Any, request: Request | None = None, pagination: dict[str, Any] | None = None) -> dict[str, Any]:
    return ResponseEnvelope(data=data, meta=build_meta(request, pagination), error=None).model_dump()


def error_response(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
    pagination: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return ResponseEnvelope(
        data=None,
        meta=build_meta(request, pagination),
        error=ErrorBody(code=code, message=message, details=details),
    ).model_dump()
