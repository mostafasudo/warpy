"""add knowledge base

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-03-01 10:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from app.core.llm_config import llm_config


revision: str = "o9p0q1r2s3t4"
down_revision: Union[str, None] = "n8o9p0q1r2s3"
branch_labels = None
depends_on = None


document_status_enum = postgresql.ENUM("processing", "ready", "error", name="document_status")
document_status_enum_no_create = postgresql.ENUM("processing", "ready", "error", name="document_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        document_status_enum.create(bind, checkfirst=True)

    status_type = document_status_enum_no_create if is_pg else sa.Text()

    body_type = sa.dialects.postgresql.JSONB() if is_pg else sa.JSON()

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("file_name", sa.Text(), nullable=False),
        sa.Column("file_type", sa.Text(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("status", status_type, nullable=False, server_default="processing"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_documents_user_id", "knowledge_documents", ["user_id"])

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("document_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("metadata", body_type, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_chunks_document_id", "knowledge_chunks", ["document_id"])
    op.create_index("ix_knowledge_chunks_user_id", "knowledge_chunks", ["user_id"])
    op.create_index("ix_knowledge_chunks_document_index", "knowledge_chunks", ["document_id", "chunk_index"])

    op.create_table(
        "knowledge_embeddings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chunk_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(llm_config.embedding_dimensions), nullable=False),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chunk_id"], ["knowledge_chunks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id", name="uq_knowledge_embedding_chunk"),
    )
    op.create_index("ix_knowledge_embeddings_chunk_id", "knowledge_embeddings", ["chunk_id"])
    op.create_index("ix_knowledge_embeddings_user_id", "knowledge_embeddings", ["user_id"])

    if is_pg:
        op.execute(
            "CREATE INDEX ix_knowledge_embeddings_vector ON knowledge_embeddings "
            "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )

    op.add_column("agents", sa.Column("knowledge_base_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.drop_column("agents", "knowledge_base_enabled")

    if is_pg:
        op.execute("DROP INDEX IF EXISTS ix_knowledge_embeddings_vector")

    op.drop_table("knowledge_embeddings")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")

    if is_pg:
        document_status_enum.drop(bind, checkfirst=True)
