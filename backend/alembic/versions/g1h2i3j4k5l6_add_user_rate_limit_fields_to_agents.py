"""add user rate limit fields to agents

Revision ID: g1h2i3j4k5l6
Revises: d4f6e8a0b2c4
Create Date: 2026-01-10 14:16:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'd4f6e8a0b2c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agents', sa.Column('user_rate_limit_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('agents', sa.Column('user_rate_limit_daily', sa.Integer(), nullable=True))
    op.add_column('agents', sa.Column('user_rate_limit_monthly', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('agents', 'user_rate_limit_monthly')
    op.drop_column('agents', 'user_rate_limit_daily')
    op.drop_column('agents', 'user_rate_limit_enabled')
