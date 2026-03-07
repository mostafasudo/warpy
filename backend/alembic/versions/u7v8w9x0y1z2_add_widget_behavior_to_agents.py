"""add widget behavior to agents

Revision ID: u7v8w9x0y1z2
Revises: q1r2s3t4u5v6
Create Date: 2026-03-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u7v8w9x0y1z2"
down_revision: Union[str, None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_behavior", sa.Text(), nullable=False, server_default=sa.text("'overlay'")),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_behavior")
