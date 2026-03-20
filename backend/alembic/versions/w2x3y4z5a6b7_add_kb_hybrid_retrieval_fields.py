"""add kb hybrid retrieval fields

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-03-19 22:30:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "w2x3y4z5a6b7"
down_revision: Union[str, None] = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.add_column(sa.Column("content_language", sa.Text(), nullable=True))
        batch_op.create_index("ix_knowledge_documents_content_language", ["content_language"], unique=False)

    with op.batch_alter_table("knowledge_chunks") as batch_op:
        batch_op.add_column(sa.Column("section_title", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("search_text", sa.Text(), nullable=True))

    if is_pg:
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_search_text_tsv
            ON knowledge_chunks
            USING gin (to_tsvector('simple', coalesce(search_text, '')))
            """
        )
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_knowledge_documents_file_name_lower
            ON knowledge_documents (lower(file_name))
            """
        )
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_section_title_lower
            ON knowledge_chunks (lower(section_title))
            """
        )
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_knowledge_documents_source_url_lower
            ON knowledge_documents (lower(source_url))
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        op.execute("DROP INDEX IF EXISTS ix_knowledge_documents_source_url_lower")
        op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_section_title_lower")
        op.execute("DROP INDEX IF EXISTS ix_knowledge_documents_file_name_lower")
        op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_search_text_tsv")

    with op.batch_alter_table("knowledge_chunks") as batch_op:
        batch_op.drop_column("search_text")
        batch_op.drop_column("section_title")

    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.drop_index("ix_knowledge_documents_content_language")
        batch_op.drop_column("content_language")
