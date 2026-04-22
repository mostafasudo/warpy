"""unify user api keys

Revision ID: a7c8d9e0f1a2
Revises: z6b7c8d9e0f1
Create Date: 2026-04-22 02:30:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "a7c8d9e0f1a2"
down_revision = "z6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_api_keys",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("key_hash", sa.Text(), nullable=False),
        sa.Column("key_ciphertext", sa.Text(), nullable=False),
        sa.Column("key_last4", sa.Text(), nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_user_api_keys_key_hash", "user_api_keys", ["key_hash"], unique=True)

    with op.batch_alter_table("agents") as batch_op:
        batch_op.drop_column("widget_api_key_last4_draft")
        batch_op.drop_column("widget_api_key_hash_draft")


def downgrade() -> None:
    with op.batch_alter_table("agents") as batch_op:
        batch_op.add_column(sa.Column("widget_api_key_hash_draft", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("widget_api_key_last4_draft", sa.Text(), nullable=True))

    op.drop_index("ix_user_api_keys_key_hash", table_name="user_api_keys")
    op.drop_table("user_api_keys")
