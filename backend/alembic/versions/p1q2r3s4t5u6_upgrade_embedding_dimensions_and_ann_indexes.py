"""upgrade embedding dimensions and ann indexes

Revision ID: p1q2r3s4t5u6
Revises: o9p0q1r2s3t4
Create Date: 2026-03-02 02:30:00.000000
"""

from typing import Union

from alembic import op


revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, None] = "o9p0q1r2s3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("DROP INDEX IF EXISTS ix_endpoint_embeddings_vector")
    op.execute("DROP INDEX IF EXISTS ix_tool_embeddings_vector")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_embeddings_vector")

    op.execute("DELETE FROM tool_embeddings")
    op.execute("DELETE FROM knowledge_embeddings")

    op.execute("ALTER TABLE tool_embeddings ALTER COLUMN embedding TYPE vector(3072)")
    op.execute("ALTER TABLE knowledge_embeddings ALTER COLUMN embedding TYPE vector(3072)")

    op.execute(
        "CREATE INDEX ix_tool_embeddings_vector ON tool_embeddings "
        "USING ivfflat ((embedding::halfvec(3072)) halfvec_cosine_ops) WITH (lists = 100)"
    )
    op.execute(
        "CREATE INDEX ix_knowledge_embeddings_vector ON knowledge_embeddings "
        "USING ivfflat ((embedding::halfvec(3072)) halfvec_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_tool_embeddings_vector")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_embeddings_vector")

    op.execute("DELETE FROM tool_embeddings")
    op.execute("DELETE FROM knowledge_embeddings")

    op.execute("ALTER TABLE tool_embeddings ALTER COLUMN embedding TYPE vector(1536)")
    op.execute("ALTER TABLE knowledge_embeddings ALTER COLUMN embedding TYPE vector(1536)")

    op.execute(
        "CREATE INDEX ix_endpoint_embeddings_vector ON tool_embeddings "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute(
        "CREATE INDEX ix_knowledge_embeddings_vector ON knowledge_embeddings "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
