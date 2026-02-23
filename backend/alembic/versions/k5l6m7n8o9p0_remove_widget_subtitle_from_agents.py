"""remove widget subtitle from agents

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-02-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, None] = "j4k5l6m7n8o9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("agents", "widget_subtitle")


def downgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_subtitle", sa.Text(), nullable=False, server_default=sa.text("'Ready to act'")),
    )
