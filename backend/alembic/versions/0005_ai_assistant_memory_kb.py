"""add ai assistant memory and knowledge tables

Revision ID: 0005_ai_assistant_memory_kb
Revises: 0004_user_map_provider
Create Date: 2026-02-20 19:40:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_ai_assistant_memory_kb"
down_revision = "0004_user_map_provider"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    assistant_mode = postgresql.ENUM("AUTO", "PLANNER", "COMPANION", name="assistant_mode", create_type=False)
    memory_source = postgresql.ENUM("explicit", "inferred", name="memory_source", create_type=False)
    memory_item_type = postgresql.ENUM("preference", "style", "routine", "place", "mode", name="memory_item_type", create_type=False)
    knowledge_status = postgresql.ENUM("draft", "approved", "deprecated", name="knowledge_status", create_type=False)
    observation_type = postgresql.ENUM(
        "gap_request",
        "failure_case",
        "feature_demand",
        "misunderstanding",
        "new_intent",
        name="observation_type",
        create_type=False,
    )
    impact_level = postgresql.ENUM("low", "med", "high", name="impact_level", create_type=False)
    kb_patch_status = postgresql.ENUM("pending", "approved", "rejected", name="kb_patch_status", create_type=False)

    assistant_mode.create(bind, checkfirst=True)
    memory_source.create(bind, checkfirst=True)
    memory_item_type.create(bind, checkfirst=True)
    knowledge_status.create(bind, checkfirst=True)
    observation_type.create(bind, checkfirst=True)
    impact_level.create(bind, checkfirst=True)
    kb_patch_status.create(bind, checkfirst=True)

    op.create_table(
        "user_profile_memory",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("default_mode", assistant_mode, nullable=False, server_default=sa.text("'AUTO'")),
        sa.Column("proactivity_level", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("preferences", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("routines", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("places", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("style_signals", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "conversation_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("token_estimate", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_conversation_summaries_user_id", "conversation_summaries", ["user_id"], unique=False)
    op.create_index("ix_conversation_summaries_session_id", "conversation_summaries", ["session_id"], unique=False)
    op.create_index("ix_conversation_summaries_user_session", "conversation_summaries", ["user_id", "session_id"], unique=True)

    op.create_table(
        "semantic_memory_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_type", memory_item_type, nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("source", memory_source, nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("prompt_user", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_semantic_memory_items_user_id", "semantic_memory_items", ["user_id"], unique=False)
    op.create_index("ix_semantic_memory_items_key", "semantic_memory_items", ["key"], unique=False)
    op.create_index("ix_semantic_memory_items_user_confirmed", "semantic_memory_items", ["user_id", "is_confirmed"], unique=False)

    op.create_table(
        "knowledge_base_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", knowledge_status, nullable=False, server_default=sa.text("'draft'")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_base_entries_slug", "knowledge_base_entries", ["slug"], unique=True)

    op.create_table(
        "observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("observation_type", observation_type, nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("examples_anonymized", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("impact", impact_level, nullable=False, server_default=sa.text("'low'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_observations_user_id", "observations", ["user_id"], unique=False)
    op.create_index("ix_observations_type", "observations", ["observation_type"], unique=False)

    op.create_table(
        "admin_kb_patches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("kb_entry_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_base_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("proposed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", kb_patch_status, nullable=False, server_default=sa.text("'pending'")),
        sa.Column("patch_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_admin_kb_patches_status", "admin_kb_patches", ["status"], unique=False)
    op.create_index("ix_admin_kb_patches_kb_entry_id", "admin_kb_patches", ["kb_entry_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_admin_kb_patches_kb_entry_id", table_name="admin_kb_patches")
    op.drop_index("ix_admin_kb_patches_status", table_name="admin_kb_patches")
    op.drop_table("admin_kb_patches")

    op.drop_index("ix_observations_type", table_name="observations")
    op.drop_index("ix_observations_user_id", table_name="observations")
    op.drop_table("observations")

    op.drop_index("ix_knowledge_base_entries_slug", table_name="knowledge_base_entries")
    op.drop_table("knowledge_base_entries")

    op.drop_index("ix_semantic_memory_items_user_confirmed", table_name="semantic_memory_items")
    op.drop_index("ix_semantic_memory_items_key", table_name="semantic_memory_items")
    op.drop_index("ix_semantic_memory_items_user_id", table_name="semantic_memory_items")
    op.drop_table("semantic_memory_items")

    op.drop_index("ix_conversation_summaries_user_session", table_name="conversation_summaries")
    op.drop_index("ix_conversation_summaries_session_id", table_name="conversation_summaries")
    op.drop_index("ix_conversation_summaries_user_id", table_name="conversation_summaries")
    op.drop_table("conversation_summaries")

    op.drop_table("user_profile_memory")

    sa.Enum(name="kb_patch_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="impact_level").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="observation_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="knowledge_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="memory_item_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="memory_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="assistant_mode").drop(op.get_bind(), checkfirst=True)
