"""add widget security disclosure enabled

Revision ID: f8a1b2c3d4e5
Revises: d2f9a4b1c7de
Create Date: 2026-01-03 13:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a1b2c3d4e5'
down_revision: Union[str, None] = 'd2f9a4b1c7de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'agents',
        sa.Column('widget_security_disclosure_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true'))
    )


def downgrade() -> None:
    op.drop_column('agents', 'widget_security_disclosure_enabled')
