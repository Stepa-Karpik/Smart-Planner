from __future__ import annotations


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found", details: dict | None = None) -> None:
        super().__init__(code="not_found", message=message, status_code=404, details=details)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden", details: dict | None = None) -> None:
        super().__init__(code="forbidden", message=message, status_code=403, details=details)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Unauthorized", details: dict | None = None) -> None:
        super().__init__(code="unauthorized", message=message, status_code=401, details=details)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict", details: dict | None = None) -> None:
        super().__init__(code="conflict", message=message, status_code=409, details=details)


class ValidationAppError(AppError):
    def __init__(self, message: str = "Validation failed", details: dict | None = None) -> None:
        super().__init__(code="validation_error", message=message, status_code=422, details=details)
