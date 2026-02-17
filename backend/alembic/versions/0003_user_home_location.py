"""add user home location fields

Revision ID: 0003_user_home_location
Revises: 0002_user_profile_route_mode
Create Date: 2026-02-16 22:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_user_home_location"
down_revision = "0002_user_profile_route_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    event_location_source = postgresql.ENUM(
        "manual_text",
        "geocoded",
        "map_pick",
        name="event_location_source",
        create_type=False,
    )

    op.add_column("users", sa.Column("home_location_text", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("home_location_lat", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("home_location_lon", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("home_location_source", event_location_source, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "home_location_source")
    op.drop_column("users", "home_location_lon")
    op.drop_column("users", "home_location_lat")
    op.drop_column("users", "home_location_text")
