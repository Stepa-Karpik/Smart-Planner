"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-16 10:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    event_status = postgresql.ENUM("planned", "done", "canceled", name="event_status", create_type=False)
    reminder_status = postgresql.ENUM("scheduled", "sent", "failed", "canceled", name="reminder_status", create_type=False)
    reminder_type = postgresql.ENUM("telegram", name="reminder_type", create_type=False)
    event_location_source = postgresql.ENUM("manual_text", "geocoded", "map_pick", name="event_location_source", create_type=False)
    ai_role = postgresql.ENUM("system", "user", "assistant", "tool", name="ai_role", create_type=False)
    ai_task_source = postgresql.ENUM("web_text", "tg_text", "web_voice", "tg_voice", name="ai_task_source", create_type=False)
    ai_task_status = postgresql.ENUM("queued", "processing", "completed", "failed", name="ai_task_status", create_type=False)

    bind = op.get_bind()
    postgresql.ENUM("planned", "done", "canceled", name="event_status").create(bind, checkfirst=True)
    postgresql.ENUM("scheduled", "sent", "failed", "canceled", name="reminder_status").create(bind, checkfirst=True)
    postgresql.ENUM("telegram", name="reminder_type").create(bind, checkfirst=True)
    postgresql.ENUM("manual_text", "geocoded", "map_pick", name="event_location_source").create(bind, checkfirst=True)
    postgresql.ENUM("system", "user", "assistant", "tool", name="ai_role").create(bind, checkfirst=True)
    postgresql.ENUM("web_text", "tg_text", "web_voice", "tg_voice", name="ai_task_source").create(bind, checkfirst=True)
    postgresql.ENUM("queued", "processing", "completed", "failed", name="ai_task_status").create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "calendars",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False, server_default=sa.text("'#2563eb'")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_calendars_user_id", "calendars", ["user_id"], unique=False)

    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("calendar_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("calendars.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_text", sa.String(length=255), nullable=True),
        sa.Column("location_lat", sa.Float(), nullable=True),
        sa.Column("location_lon", sa.Float(), nullable=True),
        sa.Column("location_source", event_location_source, nullable=False, server_default=sa.text("'manual_text'")),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", event_status, nullable=False, server_default=sa.text("'planned'")),
        sa.Column("priority", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("end_at > start_at", name="ck_events_end_after_start"),
    )
    op.create_index("ix_events_calendar_id", "events", ["calendar_id"], unique=False)
    op.create_index("ix_events_start_at", "events", ["start_at"], unique=False)
    op.create_index("ix_events_end_at", "events", ["end_at"], unique=False)
    op.create_index("ix_events_calendar_start", "events", ["calendar_id", "start_at"], unique=False)

    op.create_table(
        "reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", reminder_type, nullable=False, server_default=sa.text("'telegram'")),
        sa.Column("offset_minutes", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", reminder_status, nullable=False, server_default=sa.text("'scheduled'")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reminders_event_id", "reminders", ["event_id"], unique=False)
    op.create_index("ix_reminders_scheduled_status", "reminders", ["scheduled_at", "status"], unique=False)

    op.create_table(
        "telegram_links",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_username", sa.String(length=64), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_telegram_links_telegram_chat_id", "telegram_links", ["telegram_chat_id"], unique=True)

    op.create_table(
        "telegram_start_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_telegram_start_codes_user_id", "telegram_start_codes", ["user_id"], unique=False)
    op.create_index("ix_telegram_start_codes_code_hash", "telegram_start_codes", ["code_hash"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)

    op.create_table(
        "ai_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ai_sessions_user_id", "ai_sessions", ["user_id"], unique=False)

    op.create_table(
        "ai_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", ai_role, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ai_messages_session_id", "ai_messages", ["session_id"], unique=False)

    op.create_table(
        "ai_tasks_ingestion_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", ai_task_source, nullable=False),
        sa.Column("status", ai_task_status, nullable=False, server_default=sa.text("'queued'")),
        sa.Column("payload_ref", sa.Text(), nullable=False),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ai_tasks_ingestion_jobs_user_id", "ai_tasks_ingestion_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_tasks_ingestion_jobs_user_id", table_name="ai_tasks_ingestion_jobs")
    op.drop_table("ai_tasks_ingestion_jobs")

    op.drop_index("ix_ai_messages_session_id", table_name="ai_messages")
    op.drop_table("ai_messages")

    op.drop_index("ix_ai_sessions_user_id", table_name="ai_sessions")
    op.drop_table("ai_sessions")

    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_telegram_start_codes_code_hash", table_name="telegram_start_codes")
    op.drop_index("ix_telegram_start_codes_user_id", table_name="telegram_start_codes")
    op.drop_table("telegram_start_codes")

    op.drop_index("ix_telegram_links_telegram_chat_id", table_name="telegram_links")
    op.drop_table("telegram_links")

    op.drop_index("ix_reminders_scheduled_status", table_name="reminders")
    op.drop_index("ix_reminders_event_id", table_name="reminders")
    op.drop_table("reminders")

    op.drop_index("ix_events_calendar_start", table_name="events")
    op.drop_index("ix_events_end_at", table_name="events")
    op.drop_index("ix_events_start_at", table_name="events")
    op.drop_index("ix_events_calendar_id", table_name="events")
    op.drop_table("events")

    op.drop_index("ix_calendars_user_id", table_name="calendars")
    op.drop_table("calendars")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    sa.Enum(name="ai_task_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ai_task_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ai_role").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="event_location_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="reminder_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="reminder_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="event_status").drop(op.get_bind(), checkfirst=True)
