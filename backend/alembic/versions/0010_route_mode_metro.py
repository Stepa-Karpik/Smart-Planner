"""add metro route mode

Revision ID: 0010_route_mode_metro
Revises: 0009_feed_meta_support_tickets
Create Date: 2026-05-03 16:45:00
"""

from alembic import op


revision = "0010_route_mode_metro"
down_revision = "0009_feed_meta_support_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE route_mode ADD VALUE IF NOT EXISTS 'metro'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value without recreating the type.
    pass
