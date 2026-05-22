"""admin ecosystem scope

Revision ID: 0015_admin_ecosystem_scope
Revises: 0014_calendar_dark_color
Create Date: 2026-05-22 22:40:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0015_admin_ecosystem_scope"
down_revision = "0014_calendar_dark_color"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support'")

    op.add_column("feed_items", sa.Column("service", sa.String(length=40), nullable=False, server_default="planner"))
    op.create_index("ix_feed_items_service", "feed_items", ["service"], unique=False)
    op.alter_column("feed_items", "service", server_default=None)

    op.add_column("support_tickets", sa.Column("service", sa.String(length=40), nullable=False, server_default="planner"))
    op.create_index("ix_support_tickets_service", "support_tickets", ["service"], unique=False)
    op.alter_column("support_tickets", "service", server_default=None)

    op.create_table(
        "user_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("plan", sa.String(length=24), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_subscriptions_user_id", "user_subscriptions", ["user_id"], unique=False)
    op.create_index("ix_user_subscriptions_plan", "user_subscriptions", ["plan"], unique=False)
    op.create_index("ix_user_subscriptions_expires_at", "user_subscriptions", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_subscriptions_expires_at", table_name="user_subscriptions")
    op.drop_index("ix_user_subscriptions_plan", table_name="user_subscriptions")
    op.drop_index("ix_user_subscriptions_user_id", table_name="user_subscriptions")
    op.drop_table("user_subscriptions")

    op.drop_index("ix_support_tickets_service", table_name="support_tickets")
    op.drop_column("support_tickets", "service")

    op.drop_index("ix_feed_items_service", table_name="feed_items")
    op.drop_column("feed_items", "service")
