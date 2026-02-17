from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging
from app.core.middleware import RequestIDMiddleware
from app.core.responses import error_response, success_response
from app.integrations.redis import close_redis

logger = logging.getLogger(__name__)


def _sanitize_json(value):
    if isinstance(value, dict):
        return {key: _sanitize_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_json(item) for item in value)
    if isinstance(value, Exception):
        return str(value)
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Application startup")
    yield
    await close_redis()
    logger.info("Application shutdown")


settings = get_settings()
app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Auth", "description": "Registration, login, refresh, logout"},
        {"name": "Profile", "description": "User profile settings"},
        {"name": "Calendars", "description": "User calendars"},
        {"name": "Events", "description": "Events CRUD and filtering"},
        {"name": "Reminders", "description": "Event reminders"},
        {"name": "Telegram", "description": "Telegram account integration"},
        {"name": "Schedule", "description": "Feasibility checks"},
        {"name": "Routes", "description": "Route preview and recommendations"},
        {"name": "AI", "description": "AI assistant and sessions"},
    ],
)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/healthz", tags=["Health"])
async def healthz(request: Request):
    return success_response(data={"status": "ok"}, request=request)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(exc.code, exc.message, exc.details, request=request),
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    message = str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response("http_error", message, request=request),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    sanitized_errors = _sanitize_json(exc.errors())
    return JSONResponse(
        status_code=422,
        content=error_response(
            "validation_error",
            "Request validation failed",
            {"errors": sanitized_errors},
            request=request,
        ),
    )


@app.exception_handler(Exception)
async def unknown_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_response("internal_error", "Internal server error", request=request),
    )
