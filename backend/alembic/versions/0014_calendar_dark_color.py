"""Add calendar dark theme color.

Revision ID: 0014_calendar_dark_color
Revises: 0013_event_route_origin_home
Create Date: 2026-05-06 18:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_calendar_dark_color"
down_revision = "0013_event_route_origin_home"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendars", sa.Column("color_dark", sa.String(length=16), nullable=False, server_default="#60a5fa"))
    op.alter_column("calendars", "color_dark", server_default=None)


def downgrade() -> None:
    op.drop_column("calendars", "color_dark")
