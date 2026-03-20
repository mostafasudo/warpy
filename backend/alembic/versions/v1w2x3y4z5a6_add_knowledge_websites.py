"""add knowledge websites

Revision ID: v1w2x3y4z5a6
Revises: t6u7v8w9x0y1
Create Date: 2026-03-18 23:50:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "v1w2x3y4z5a6"
down_revision: Union[str, None] = "t6u7v8w9x0y1"
branch_labels = None
depends_on = None


website_status_enum = sa.Enum(
    "processing",
    "ready",
    "partial",
    "error",
    name="knowledge_website_status",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "knowledge_websites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("input_url", sa.Text(), nullable=False),
        sa.Column("scope_url", sa.Text(), nullable=False),
        sa.Column("status", website_status_enum, nullable=False, server_default="processing"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_crawled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_successful_crawled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_refresh_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "scope_url", name="uq_knowledge_websites_user_scope_url"),
    )
    op.create_index("ix_knowledge_websites_user_id", "knowledge_websites", ["user_id"])
    op.create_index("ix_knowledge_websites_next_refresh_at", "knowledge_websites", ["next_refresh_at"])

    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.add_column(sa.Column("source_kind", sa.Text(), nullable=False, server_default="file"))
        batch_op.add_column(sa.Column("website_id", sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column("source_url", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("source_hash", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("is_searchable", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch_op.create_index("ix_knowledge_documents_website_id", ["website_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_knowledge_documents_website_id",
            "knowledge_websites",
            ["website_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_unique_constraint(
            "uq_knowledge_documents_website_source_url",
            ["website_id", "source_url"],
        )

    op.execute("UPDATE knowledge_documents SET source_kind = 'file'")
    op.execute("UPDATE knowledge_documents SET is_searchable = CASE WHEN status = 'ready' THEN true ELSE false END")


def downgrade() -> None:
    with op.batch_alter_table("knowledge_documents") as batch_op:
        batch_op.drop_constraint("uq_knowledge_documents_website_source_url", type_="unique")
        batch_op.drop_constraint("fk_knowledge_documents_website_id", type_="foreignkey")
        batch_op.drop_index("ix_knowledge_documents_website_id")
        batch_op.drop_column("is_searchable")
        batch_op.drop_column("source_hash")
        batch_op.drop_column("source_url")
        batch_op.drop_column("website_id")
        batch_op.drop_column("source_kind")

    op.drop_index("ix_knowledge_websites_next_refresh_at", table_name="knowledge_websites")
    op.drop_index("ix_knowledge_websites_user_id", table_name="knowledge_websites")
    op.drop_table("knowledge_websites")
