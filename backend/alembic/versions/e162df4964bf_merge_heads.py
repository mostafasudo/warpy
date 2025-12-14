"""merge_heads

Revision ID: e162df4964bf
Revises: 1a2b3c4d5e67, c7f5e2a1c123
Create Date: 2025-12-14 09:22:04.505522

"""
from alembic import op
import sqlalchemy as sa


revision = 'e162df4964bf'
down_revision = ('1a2b3c4d5e67', 'c7f5e2a1c123')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
