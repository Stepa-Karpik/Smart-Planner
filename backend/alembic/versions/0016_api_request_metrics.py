"""api request metrics

Revision ID: 0016_api_request_metrics
Revises: 0015_admin_ecosystem_scope
Create Date: 2026-05-22 23:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0016_api_request_metrics"
down_revision = "0015_admin_ecosystem_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_request_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("service", sa.String(length=40), nullable=False),
        sa.Column("method", sa.String(length=12), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_api_request_metrics_service", "api_request_metrics", ["service"], unique=False)
    op.create_index("ix_api_request_metrics_path", "api_request_metrics", ["path"], unique=False)
    op.create_index("ix_api_request_metrics_created_at", "api_request_metrics", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_api_request_metrics_created_at", table_name="api_request_metrics")
    op.drop_index("ix_api_request_metrics_path", table_name="api_request_metrics")
    op.drop_index("ix_api_request_metrics_service", table_name="api_request_metrics")
    op.drop_table("api_request_metrics")
