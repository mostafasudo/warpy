"""add widget theme to agents

Revision ID: z6b7c8d9e0f1
Revises: y4z5a6b7c8d9
Create Date: 2026-04-18 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'z6b7c8d9e0f1'
down_revision: Union[str, None] = 'y4z5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    theme_type = sa.dialects.postgresql.JSONB() if is_pg else sa.JSON()

    op.add_column(
        "agents",
        sa.Column("widget_appearance_mode", sa.Text(), nullable=False, server_default="infer"),
    )
    op.add_column(
        "agents",
        sa.Column("widget_theme", theme_type, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_theme")
    op.drop_column("agents", "widget_appearance_mode")
