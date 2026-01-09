"""make conversation_actions tool_call_id not null

Revision ID: d4f6e8a0b2c4
Revises: c0b1a2d3e4f5
Create Date: 2026-01-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4f6e8a0b2c4"
down_revision: Union[str, None] = "c0b1a2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE conversation_actions "
        "SET tool_call_id = CAST(id AS TEXT) "
        "WHERE tool_call_id IS NULL"
    ))
    op.alter_column(
        "conversation_actions",
        "tool_call_id",
        existing_type=sa.Text(),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "conversation_actions",
        "tool_call_id",
        existing_type=sa.Text(),
        nullable=True,
    )
