"""add user roles and feed items

Revision ID: 0008_user_roles_and_feed_items
Revises: 0007_user_twofa_settings
Create Date: 2026-02-23 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0008_user_roles_and_feed_items"
down_revision = "0007_user_twofa_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = postgresql.ENUM("user", "admin", name="user_role", create_type=False)
    user_role.create(op.get_bind(), checkfirst=True)

    op.add_column("users", sa.Column("role", user_role, nullable=False, server_default=sa.text("'user'")))
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.alter_column("users", "role", server_default=None)

    op.create_table(
        "feed_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.String(length=4000), nullable=False),
        sa.Column("target_username", sa.String(length=64), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_feed_items_created_at", "feed_items", ["created_at"], unique=False)
    op.create_index("ix_feed_items_type", "feed_items", ["type"], unique=False)
    op.create_index("ix_feed_items_target_username", "feed_items", ["target_username"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_feed_items_target_username", table_name="feed_items")
    op.drop_index("ix_feed_items_type", table_name="feed_items")
    op.drop_index("ix_feed_items_created_at", table_name="feed_items")
    op.drop_table("feed_items")

    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "role")

    user_role = postgresql.ENUM("user", "admin", name="user_role", create_type=False)
    user_role.drop(op.get_bind(), checkfirst=True)

