"""rename endpoints schema to tools

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-02-26 23:45:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, None] = "l6m7n8o9p0q1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("endpoints", "tools")

    with op.batch_alter_table("tools") as batch_op:
        batch_op.alter_column("path", existing_type=sa.Text(), nullable=True)
        batch_op.alter_column("method", existing_type=sa.Enum(name="http_method"), nullable=True)
        batch_op.drop_constraint("uq_endpoint_user_path_method", type_="unique")
        batch_op.create_unique_constraint("uq_tool_user_path_method", ["user_id", "path", "method"])

    op.rename_table("endpoint_embeddings", "tool_embeddings")

    with op.batch_alter_table("tool_embeddings") as batch_op:
        batch_op.alter_column("endpoint_id", new_column_name="tool_id", existing_type=sa.UUID(), nullable=False)
        batch_op.drop_constraint("uq_endpoint_embedding_endpoint", type_="unique")
        batch_op.create_unique_constraint("uq_tool_embedding_tool", ["tool_id"])

    with op.batch_alter_table("conversation_actions") as batch_op:
        batch_op.drop_index("ix_conversation_actions_user_endpoint_created_at")
        batch_op.alter_column("endpoint_id", new_column_name="tool_id", existing_type=sa.UUID(), nullable=True)
        batch_op.create_index("ix_conversation_actions_user_tool_created_at", ["user_id", "tool_id", "created_at"], unique=False)

    with op.batch_alter_table("user_stats") as batch_op:
        batch_op.alter_column("endpoint_count", new_column_name="tool_count", existing_type=sa.Integer(), nullable=False, server_default="0")


def downgrade() -> None:
    with op.batch_alter_table("user_stats") as batch_op:
        batch_op.alter_column("tool_count", new_column_name="endpoint_count", existing_type=sa.Integer(), nullable=False, server_default="0")

    with op.batch_alter_table("conversation_actions") as batch_op:
        batch_op.drop_index("ix_conversation_actions_user_tool_created_at")
        batch_op.alter_column("tool_id", new_column_name="endpoint_id", existing_type=sa.UUID(), nullable=True)
        batch_op.create_index("ix_conversation_actions_user_endpoint_created_at", ["user_id", "endpoint_id", "created_at"], unique=False)

    with op.batch_alter_table("tool_embeddings") as batch_op:
        batch_op.drop_constraint("uq_tool_embedding_tool", type_="unique")
        batch_op.alter_column("tool_id", new_column_name="endpoint_id", existing_type=sa.UUID(), nullable=False)
        batch_op.create_unique_constraint("uq_endpoint_embedding_endpoint", ["endpoint_id"])

    op.rename_table("tool_embeddings", "endpoint_embeddings")

    with op.batch_alter_table("tools") as batch_op:
        batch_op.drop_constraint("uq_tool_user_path_method", type_="unique")
        batch_op.create_unique_constraint("uq_endpoint_user_path_method", ["user_id", "path", "method"])
        batch_op.alter_column("method", existing_type=sa.Enum(name="http_method"), nullable=False)
        batch_op.alter_column("path", existing_type=sa.Text(), nullable=False)

    op.rename_table("tools", "endpoints")
