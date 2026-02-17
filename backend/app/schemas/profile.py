from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.enums import EventLocationSource, RouteMode


class ProfileRead(BaseModel):
    user_id: str
    email: str
    username: str
    display_name: str | None
    default_route_mode: RouteMode
    home_location_text: str | None = None
    home_location_lat: float | None = None
    home_location_lon: float | None = None
    home_location_source: EventLocationSource | None = None


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    display_name: str | None = Field(default=None, max_length=128)
    default_route_mode: RouteMode | None = None
    home_location_text: str | None = Field(default=None, max_length=255)
    home_location_lat: float | None = Field(default=None, ge=-90, le=90)
    home_location_lon: float | None = Field(default=None, ge=-180, le=180)
    home_location_source: EventLocationSource | None = None

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("username must not be empty")
        return normalized

    @field_validator("home_location_text")
    @classmethod
    def normalize_home_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_home_coords(self):
        if (self.home_location_lat is None) ^ (self.home_location_lon is None):
            raise ValueError("home location requires both lat and lon")
        return self


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
