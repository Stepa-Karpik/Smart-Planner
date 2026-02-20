"""add ai session chat typing and soft delete

Revision ID: 0006_ai_session_chat_type
Revises: 0005_ai_assistant_memory_kb
Create Date: 2026-02-20 21:15:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_ai_session_chat_type"
down_revision = "0005_ai_assistant_memory_kb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    ai_chat_type = postgresql.ENUM("planner", "companion", name="ai_chat_type", create_type=False)
    ai_chat_type.create(bind, checkfirst=True)

    op.add_column(
        "ai_sessions",
        sa.Column(
            "chat_type",
            ai_chat_type,
            nullable=True,
            server_default=sa.text("'companion'"),
        ),
    )
    op.add_column("ai_sessions", sa.Column("display_index", sa.Integer(), nullable=True))
    op.add_column(
        "ai_sessions",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute("UPDATE ai_sessions SET chat_type='companion' WHERE chat_type IS NULL")
    op.execute(
        """
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
            FROM ai_sessions
        )
        UPDATE ai_sessions AS s
        SET display_index = ranked.rn
        FROM ranked
        WHERE s.id = ranked.id
        """
    )

    op.alter_column("ai_sessions", "chat_type", nullable=False, server_default=sa.text("'companion'"))
    op.alter_column("ai_sessions", "display_index", nullable=False)

    op.create_index("ix_ai_sessions_user_active", "ai_sessions", ["user_id", "is_deleted"], unique=False)
    op.create_index(
        "ix_ai_sessions_user_chat_type_last_used",
        "ai_sessions",
        ["user_id", "chat_type", "last_used_at"],
        unique=False,
    )
    op.create_index("ix_ai_sessions_user_display_index", "ai_sessions", ["user_id", "display_index"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_ai_sessions_user_display_index", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_user_chat_type_last_used", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_user_active", table_name="ai_sessions")

    op.drop_column("ai_sessions", "is_deleted")
    op.drop_column("ai_sessions", "display_index")
    op.drop_column("ai_sessions", "chat_type")

    sa.Enum(name="ai_chat_type").drop(op.get_bind(), checkfirst=True)
