"""event external references

Revision ID: 0017_event_external_ref
Revises: 0016_api_request_metrics
Create Date: 2026-05-31 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_event_external_ref"
down_revision = "0016_api_request_metrics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("external_source", sa.String(length=64), nullable=True))
    op.add_column("events", sa.Column("external_ref", sa.String(length=255), nullable=True))
    op.create_index("ix_events_external_ref", "events", ["external_source", "external_ref"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_events_external_ref", table_name="events")
    op.drop_column("events", "external_ref")
    op.drop_column("events", "external_source")
