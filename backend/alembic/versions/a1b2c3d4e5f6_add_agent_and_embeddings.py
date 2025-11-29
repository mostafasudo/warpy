"""add agent and embeddings

Revision ID: a1b2c3d4e5f6
Revises: ed2ee7ad1a42
Create Date: 2025-11-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = 'a1b2c3d4e5f6'
down_revision = '0c0cf44b8110'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    op.create_table('endpoint_embeddings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('endpoint_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=False),
        sa.Column('content_hash', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['endpoint_id'], ['endpoints.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint_id', name='uq_endpoint_embedding_endpoint')
    )
    op.create_index('ix_endpoint_embeddings_endpoint_id', 'endpoint_embeddings', ['endpoint_id'])
    op.create_index('ix_endpoint_embeddings_user_id', 'endpoint_embeddings', ['user_id'])
    op.execute('CREATE INDEX ix_endpoint_embeddings_vector ON endpoint_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)')

    op.create_table('agents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_agent_user')
    )
    op.create_index('ix_agents_user_id', 'agents', ['user_id'])

    op.create_table('conversations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('agent_id', sa.UUID(), nullable=False),
        sa.Column('participant', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_conversations_agent_id', 'conversations', ['agent_id'])

    op.create_table('messages',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.Text(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_messages_conversation_id', 'messages', ['conversation_id'])


def downgrade() -> None:
    op.drop_table('messages')
    op.drop_table('conversations')
    op.drop_table('agents')
    op.execute('DROP INDEX IF EXISTS ix_endpoint_embeddings_vector')
    op.drop_table('endpoint_embeddings')

