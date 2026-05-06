"""Add event route origin home override.

Revision ID: 0013_event_route_origin_home
Revises: 0012_response_time_indexes
Create Date: 2026-05-06 17:52:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_event_route_origin_home"
down_revision = "0012_response_time_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("route_origin_home", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("events", "route_origin_home", server_default=None)


def downgrade() -> None:
    op.drop_column("events", "route_origin_home")
