"""add agent_enabled flag to endpoints

Revision ID: 1a2b3c4d5e67
Revises: f2b4d0e1a6c3
Create Date: 2025-12-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "1a2b3c4d5e67"
down_revision = "f2b4d0e1a6c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "endpoints",
        sa.Column("agent_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )


def downgrade() -> None:
    op.drop_column("endpoints", "agent_enabled")
