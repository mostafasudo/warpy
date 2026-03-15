"""add widget runs and enforce message sequence uniqueness

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
Create Date: 2026-03-15 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s5t6u7v8w9x0"
down_revision: Union[str, None] = "r4s5t6u7v8w9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_message_sequences() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("""
            WITH ordered AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY conversation_id
                        ORDER BY sequence, created_at, id
                    ) AS next_sequence
                FROM messages
            )
            UPDATE messages
            SET sequence = ordered.next_sequence
            FROM ordered
            WHERE messages.id = ordered.id
              AND messages.sequence <> ordered.next_sequence
        """))
        return

    rows = bind.execute(sa.text("""
        SELECT id, conversation_id
        FROM messages
        ORDER BY conversation_id, sequence, created_at, id
    """)).fetchall()
    counters: dict[object, int] = {}
    updates: list[dict[str, object]] = []
    for row in rows:
        conversation_id = row.conversation_id
        counters[conversation_id] = counters.get(conversation_id, 0) + 1
        updates.append({"sequence": counters[conversation_id], "message_id": row.id})
        if len(updates) >= 500:
            bind.execute(sa.text("UPDATE messages SET sequence = :sequence WHERE id = :message_id"), updates)
            updates = []
    if updates:
        bind.execute(sa.text("UPDATE messages SET sequence = :sequence WHERE id = :message_id"), updates)


def upgrade() -> None:
    widget_run_status = sa.Enum(
        "running",
        "waiting_for_tools",
        "completed",
        "superseded",
        "failed",
        name="widget_run_status",
        native_enum=False,
    )

    op.create_table(
        "widget_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.Text(), nullable=False),
        sa.Column("status", widget_run_status, nullable=False, server_default="running"),
        sa.Column("owner_token", sa.Text(), nullable=True),
        sa.Column("user_message_id", sa.UUID(), nullable=True),
        sa.Column("assistant_message_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assistant_message_id"], ["messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_message_id"], ["messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "request_id", name="uq_widget_runs_conversation_request"),
    )
    op.create_index("ix_widget_runs_conversation_status", "widget_runs", ["conversation_id", "status"])

    _normalize_message_sequences()
    op.drop_index("ix_messages_conversation_sequence", table_name="messages")
    op.create_unique_constraint("uq_messages_conversation_sequence", "messages", ["conversation_id", "sequence"])


def downgrade() -> None:
    op.drop_constraint("uq_messages_conversation_sequence", "messages", type_="unique")
    op.create_index("ix_messages_conversation_sequence", "messages", ["conversation_id", "sequence"])

    op.drop_index("ix_widget_runs_conversation_status", table_name="widget_runs")
    op.drop_table("widget_runs")
