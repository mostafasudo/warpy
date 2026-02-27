"""add response body to conversation actions

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-02-27 03:20:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "n8o9p0q1r2s3"
down_revision: Union[str, None] = "m7n8o9p0q1r2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    body_type = JSONB() if bind.dialect.name == "postgresql" else sa.JSON()
    op.add_column("conversation_actions", sa.Column("response_body", body_type, nullable=True))


def downgrade() -> None:
    op.drop_column("conversation_actions", "response_body")
