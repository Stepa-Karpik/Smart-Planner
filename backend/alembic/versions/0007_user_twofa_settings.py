"""add user 2fa settings

Revision ID: 0007_user_twofa_settings
Revises: 0006_ai_session_chat_type
Create Date: 2026-02-22 12:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_user_twofa_settings"
down_revision = "0006_ai_session_chat_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("twofa_method", sa.String(length=16), nullable=False, server_default=sa.text("'none'")),
    )
    op.add_column("users", sa.Column("twofa_totp_secret", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("twofa_totp_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("twofa_telegram_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("twofa_last_totp_step", sa.Integer(), nullable=True))
    op.create_index("ix_users_twofa_method", "users", ["twofa_method"], unique=False)
    op.alter_column("users", "twofa_method", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_users_twofa_method", table_name="users")
    op.drop_column("users", "twofa_last_totp_step")
    op.drop_column("users", "twofa_telegram_enabled_at")
    op.drop_column("users", "twofa_totp_enabled_at")
    op.drop_column("users", "twofa_totp_secret")
    op.drop_column("users", "twofa_method")
