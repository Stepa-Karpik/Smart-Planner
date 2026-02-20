"""add user map provider

Revision ID: 0004_user_map_provider
Revises: 0003_user_home_location
Create Date: 2026-02-20 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_user_map_provider"
down_revision = "0003_user_home_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    map_provider = postgresql.ENUM("leaflet", "yandex", name="map_provider")
    map_provider.create(bind, checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "map_provider",
            map_provider,
            nullable=False,
            server_default=sa.text("'leaflet'"),
        ),
    )
    op.alter_column("users", "map_provider", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "map_provider")

    sa.Enum(name="map_provider").drop(op.get_bind(), checkfirst=True)

