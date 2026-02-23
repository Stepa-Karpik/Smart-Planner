"""add feed meta and support tickets

Revision ID: 0009_feed_meta_support_tickets
Revises: 0008_user_roles_and_feed_items
Create Date: 2026-02-23 16:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009_feed_meta_support_tickets"
down_revision = "0008_user_roles_and_feed_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("feed_items", sa.Column("meta_json", sa.JSON(), nullable=True))

    support_ticket_status = postgresql.ENUM("open", "answered", "closed", name="support_ticket_status", create_type=False)
    support_ticket_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("public_number", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column("subtopic", sa.String(length=120), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("status", support_ticket_status, nullable=False, server_default=sa.text("'open'")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"], unique=False)
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"], unique=False)
    op.create_index("ix_support_tickets_public_number", "support_tickets", ["public_number"], unique=True)
    op.alter_column("support_tickets", "status", server_default=None)

    op.create_table(
        "support_ticket_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("support_tickets.id"), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("author_role", sa.String(length=16), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachments_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_support_ticket_messages_ticket_id", "support_ticket_messages", ["ticket_id"], unique=False)
    op.create_index("ix_support_ticket_messages_author_role", "support_ticket_messages", ["author_role"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_support_ticket_messages_author_role", table_name="support_ticket_messages")
    op.drop_index("ix_support_ticket_messages_ticket_id", table_name="support_ticket_messages")
    op.drop_table("support_ticket_messages")

    op.drop_index("ix_support_tickets_public_number", table_name="support_tickets")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
    op.drop_table("support_tickets")

    support_ticket_status = postgresql.ENUM("open", "answered", "closed", name="support_ticket_status", create_type=False)
    support_ticket_status.drop(op.get_bind(), checkfirst=True)

    op.drop_column("feed_items", "meta_json")
