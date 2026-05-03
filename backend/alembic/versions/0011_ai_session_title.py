"""Add AI session title.

Revision ID: 0011_ai_session_title
Revises: 0010_route_mode_metro
Create Date: 2026-05-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_ai_session_title"
down_revision = "0010_route_mode_metro"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_sessions", sa.Column("title", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_sessions", "title")
