"""add widget suggestions to agents

Revision ID: r4s5t6u7v8w9
Revises: u7v8w9x0y1z2
Create Date: 2026-03-08 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r4s5t6u7v8w9"
down_revision: Union[str, None] = "u7v8w9x0y1z2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    suggestions_type = sa.dialects.postgresql.JSONB() if is_pg else sa.JSON()
    suggestions_default = sa.text("'[]'::jsonb") if is_pg else sa.text("'[]'")

    op.add_column(
        "agents",
        sa.Column("widget_suggestions_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "agents",
        sa.Column(
            "widget_starter_suggestions",
            suggestions_type,
            nullable=False,
            server_default=suggestions_default,
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_starter_suggestions")
    op.drop_column("agents", "widget_suggestions_enabled")
