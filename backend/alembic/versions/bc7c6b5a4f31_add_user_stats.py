"""add user stats

Revision ID: bc7c6b5a4f31
Revises: a1b2c3d4e5f6
Create Date: 2025-02-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "bc7c6b5a4f31"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_stats",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("endpoint_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("user_id")
    )


def downgrade() -> None:
    op.drop_table("user_stats")
