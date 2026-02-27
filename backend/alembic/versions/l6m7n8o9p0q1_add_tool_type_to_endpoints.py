"""add tool type to endpoints

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-02-25 23:55:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "l6m7n8o9p0q1"
down_revision: Union[str, None] = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "endpoints",
        sa.Column("tool_type", sa.Text(), nullable=False, server_default="backend"),
    )


def downgrade() -> None:
    op.drop_column("endpoints", "tool_type")
