"""add frontend action support to conversation_actions

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-01-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, None] = 'h2i3j4k5l6m7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversation_actions', sa.Column('tool_type', sa.Text(), nullable=False, server_default='backend'))
    op.add_column('conversation_actions', sa.Column('frontend_goal', sa.Text(), nullable=True))
    op.add_column('conversation_actions', sa.Column('frontend_url', sa.Text(), nullable=True))
    op.add_column('conversation_actions', sa.Column('frontend_actions', JSONB(), nullable=True))
    op.alter_column('conversation_actions', 'endpoint_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('conversation_actions', 'feature_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM conversation_actions WHERE endpoint_id IS NULL OR feature_id IS NULL")
    op.alter_column('conversation_actions', 'feature_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('conversation_actions', 'endpoint_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('conversation_actions', 'frontend_actions')
    op.drop_column('conversation_actions', 'frontend_url')
    op.drop_column('conversation_actions', 'frontend_goal')
    op.drop_column('conversation_actions', 'tool_type')
