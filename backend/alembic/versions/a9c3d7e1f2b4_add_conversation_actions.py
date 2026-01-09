"""add conversation actions

Revision ID: a9c3d7e1f2b4
Revises: f8a1b2c3d4e5
Create Date: 2026-01-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a9c3d7e1f2b4"
down_revision: Union[str, None] = "f8a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversation_actions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("endpoint_id", sa.UUID(), nullable=False),
        sa.Column("feature_id", sa.UUID(), nullable=False),
        sa.Column("tool_call_id", sa.Text(), nullable=True),
        sa.Column(
            "request",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["endpoint_id"], ["endpoints.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "conversation_id", "tool_call_id", name="uq_conversation_actions_key"),
    )
    op.create_index("ix_conversation_actions_user_id", "conversation_actions", ["user_id"])
    op.create_index("ix_conversation_actions_conversation_id", "conversation_actions", ["conversation_id"])
    op.create_index("ix_conversation_actions_endpoint_id", "conversation_actions", ["endpoint_id"])
    op.create_index("ix_conversation_actions_feature_id", "conversation_actions", ["feature_id"])
    op.create_index("ix_conversation_actions_user_created_at", "conversation_actions", ["user_id", "created_at"])
    op.create_index(
        "ix_conversation_actions_conversation_created_at",
        "conversation_actions",
        ["conversation_id", "created_at"],
    )
    op.create_index(
        "ix_conversation_actions_user_endpoint_created_at",
        "conversation_actions",
        ["user_id", "endpoint_id", "created_at"],
    )

    op.create_index("ix_conversations_agent_updated_at", "conversations", ["agent_id", "updated_at"])
    op.create_index("ix_conversations_agent_created_at", "conversations", ["agent_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_conversations_agent_created_at", table_name="conversations")
    op.drop_index("ix_conversations_agent_updated_at", table_name="conversations")

    op.drop_index("ix_conversation_actions_user_endpoint_created_at", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_conversation_created_at", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_user_created_at", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_feature_id", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_endpoint_id", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_conversation_id", table_name="conversation_actions")
    op.drop_index("ix_conversation_actions_user_id", table_name="conversation_actions")
    op.drop_table("conversation_actions")
