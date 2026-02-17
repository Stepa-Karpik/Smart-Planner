from __future__ import annotations

from enum import Enum
from typing import TypeVar

from sqlalchemy import Enum as SAEnum

EnumType = TypeVar("EnumType", bound=Enum)


def db_enum(enum_cls: type[EnumType], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )
