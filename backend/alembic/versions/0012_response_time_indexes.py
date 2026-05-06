"""Add response time indexes.

Revision ID: 0012_response_time_indexes
Revises: 0011_ai_session_title
Create Date: 2026-05-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_response_time_indexes"
down_revision = "0011_ai_session_title"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_events_status_start_not_deleted",
        "events",
        ["status", "start_at", "end_at"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_feed_items_published_created",
        "feed_items",
        ["published_at", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_support_tickets_user_updated",
        "support_tickets",
        ["user_id", "updated_at", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_support_tickets_status_updated",
        "support_tickets",
        ["status", "updated_at", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_support_tickets_status_updated", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_updated", table_name="support_tickets")
    op.drop_index("ix_feed_items_published_created", table_name="feed_items")
    op.drop_index("ix_events_status_start_not_deleted", table_name="events")
