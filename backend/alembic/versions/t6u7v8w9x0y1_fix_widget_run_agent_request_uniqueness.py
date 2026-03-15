"""fix widget run agent request uniqueness

Revision ID: t6u7v8w9x0y1
Revises: s5t6u7v8w9x0
Create Date: 2026-03-15 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t6u7v8w9x0y1"
down_revision: Union[str, None] = "s5t6u7v8w9x0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill_widget_run_agent_ids() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("""
        DELETE FROM widget_runs
        WHERE NOT EXISTS (
            SELECT 1
            FROM conversations
            WHERE conversations.id = widget_runs.conversation_id
        )
    """))
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("""
            UPDATE widget_runs AS widget_runs
            SET agent_id = conversations.agent_id
            FROM conversations
            WHERE conversations.id = widget_runs.conversation_id
              AND widget_runs.agent_id IS NULL
        """))
        return

    bind.execute(sa.text("""
        UPDATE widget_runs
        SET agent_id = (
            SELECT conversations.agent_id
            FROM conversations
            WHERE conversations.id = widget_runs.conversation_id
        )
        WHERE agent_id IS NULL
    """))

    remaining = bind.execute(sa.text("""
        SELECT COUNT(*)
        FROM widget_runs
        WHERE agent_id IS NULL
    """)).scalar_one()
    if remaining:
        raise RuntimeError(f"Failed to backfill agent_id for {remaining} widget_runs rows")


def _normalize_widget_run_duplicates() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("""
            WITH ranked AS (
                SELECT
                    id,
                    request_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY agent_id, request_id
                        ORDER BY updated_at DESC, created_at DESC, id DESC
                    ) AS row_number
                FROM widget_runs
            )
            UPDATE widget_runs
            SET status = 'superseded',
                owner_token = NULL,
                request_id = ranked.request_id || '::legacy::' || widget_runs.id::text
            FROM ranked
            WHERE widget_runs.id = ranked.id
              AND ranked.row_number > 1
        """))
        return

    rows = bind.execute(sa.text("""
        SELECT id, agent_id, request_id
        FROM widget_runs
        ORDER BY agent_id, request_id, updated_at DESC, created_at DESC, id DESC
    """)).fetchall()
    seen: set[tuple[str, str]] = set()
    for row in rows:
        mapping = row._mapping
        agent_id = str(mapping["agent_id"])
        request_id = str(mapping["request_id"])
        key = (agent_id, request_id)
        if key not in seen:
            seen.add(key)
            continue
        bind.execute(
            sa.text("""
                UPDATE widget_runs
                SET status = :status,
                    owner_token = NULL,
                    request_id = :request_id
                WHERE id = :widget_run_id
            """),
            {
                "status": "superseded",
                "request_id": f"{request_id}::legacy::{mapping['id']}",
                "widget_run_id": mapping["id"],
            },
        )


def upgrade() -> None:
    op.add_column("widget_runs", sa.Column("agent_id", sa.UUID(), nullable=True))
    _backfill_widget_run_agent_ids()
    _normalize_widget_run_duplicates()

    with op.batch_alter_table("widget_runs") as batch_op:
        batch_op.alter_column("agent_id", nullable=False)
        batch_op.create_foreign_key(
            "fk_widget_runs_agent_id",
            "agents",
            ["agent_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.drop_constraint("uq_widget_runs_conversation_request", type_="unique")
        batch_op.create_unique_constraint("uq_widget_runs_agent_request", ["agent_id", "request_id"])
        batch_op.create_index("ix_widget_runs_conversation_request", ["conversation_id", "request_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("widget_runs") as batch_op:
        batch_op.drop_index("ix_widget_runs_conversation_request")
        batch_op.drop_constraint("uq_widget_runs_agent_request", type_="unique")
        batch_op.create_unique_constraint("uq_widget_runs_conversation_request", ["conversation_id", "request_id"])
        batch_op.drop_constraint("fk_widget_runs_agent_id", type_="foreignkey")
        batch_op.drop_column("agent_id")
