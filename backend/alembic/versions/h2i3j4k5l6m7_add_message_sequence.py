"""add message sequence

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-01-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('sequence', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_messages_conversation_sequence', 'messages', ['conversation_id', 'sequence'])


def downgrade() -> None:
    op.drop_index('ix_messages_conversation_sequence', table_name='messages')
    op.drop_column('messages', 'sequence')
