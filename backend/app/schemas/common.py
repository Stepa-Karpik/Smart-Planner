from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    limit: int
    offset: int
    total: int


class BaseReadModel(BaseModel):
    model_config = {"from_attributes": True}


class EnvelopeSuccess(BaseModel):
    data: Any
    meta: dict[str, Any] = Field(default_factory=dict)
    error: None = None


class EnvelopeError(BaseModel):
    data: None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    error: dict[str, Any]


class DateRangeQuery(BaseModel):
    from_dt: datetime = Field(alias="from")
    to_dt: datetime = Field(alias="to")
