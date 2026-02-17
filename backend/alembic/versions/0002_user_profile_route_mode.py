"""add user profile fields and default route mode

Revision ID: 0002_user_profile_route_mode
Revises: 0001_initial
Create Date: 2026-02-16 14:20:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_user_profile_route_mode"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    route_mode = postgresql.ENUM("walking", "driving", "public_transport", "bicycle", name="route_mode")
    route_mode.create(bind, checkfirst=True)

    op.add_column("users", sa.Column("display_name", sa.String(length=128), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "default_route_mode",
            route_mode,
            nullable=False,
            server_default=sa.text("'public_transport'"),
        ),
    )
    op.alter_column("users", "default_route_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "default_route_mode")
    op.drop_column("users", "display_name")

    sa.Enum(name="route_mode").drop(op.get_bind(), checkfirst=True)
