"""add widget security to agents

Revision ID: 7b3c2d1e8f4a
Revises: e162df4964bf
Create Date: 2025-12-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "7b3c2d1e8f4a"
down_revision = "e162df4964bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_auth_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.add_column(
        "agents",
        sa.Column("widget_refresh_endpoint_path", sa.Text(), nullable=False, server_default=sa.text("'/widget-token'"))
    )
    op.add_column(
        "agents",
        sa.Column("widget_api_key_hash", sa.Text(), nullable=True)
    )
    op.add_column(
        "agents",
        sa.Column("widget_api_key_last4", sa.Text(), nullable=True)
    )
    op.add_column(
        "agents",
        sa.Column("widget_auth_enabled_draft", sa.Boolean(), nullable=True)
    )
    op.add_column(
        "agents",
        sa.Column("widget_refresh_endpoint_path_draft", sa.Text(), nullable=True)
    )
    op.add_column(
        "agents",
        sa.Column("widget_api_key_hash_draft", sa.Text(), nullable=True)
    )
    op.add_column(
        "agents",
        sa.Column("widget_api_key_last4_draft", sa.Text(), nullable=True)
    )
    op.create_index(
        "ix_agents_widget_api_key_hash",
        "agents",
        ["widget_api_key_hash"],
        unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_agents_widget_api_key_hash", table_name="agents")
    op.drop_column("agents", "widget_api_key_last4_draft")
    op.drop_column("agents", "widget_api_key_hash_draft")
    op.drop_column("agents", "widget_refresh_endpoint_path_draft")
    op.drop_column("agents", "widget_auth_enabled_draft")
    op.drop_column("agents", "widget_api_key_last4")
    op.drop_column("agents", "widget_api_key_hash")
    op.drop_column("agents", "widget_refresh_endpoint_path")
    op.drop_column("agents", "widget_auth_enabled")

