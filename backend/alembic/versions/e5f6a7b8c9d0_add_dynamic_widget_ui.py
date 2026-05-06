"""add dynamic widget ui

Revision ID: e5f6a7b8c9d0
Revises: b8d9e0f1a2b3
Create Date: 2026-05-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "b8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_response_mode", sa.Text(), nullable=False, server_default="warpy_components"),
    )
    op.execute(sa.text("UPDATE agents SET widget_response_mode = 'markdown'"))
    op.add_column("messages", sa.Column("render_payload", sa.JSON(), nullable=True))
    op.create_table(
        "widget_ui_components",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("component_key", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False, server_default="1"),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("framework", sa.Text(), nullable=False, server_default="react"),
        sa.Column("props_schema", sa.JSON(), nullable=False),
        sa.Column("suitability", sa.Text(), nullable=False),
        sa.Column("constraints", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "component_key", "version", name="uq_widget_ui_components_user_key_version"),
    )
    op.create_index("ix_widget_ui_components_user_id", "widget_ui_components", ["user_id"])
    op.create_index("ix_widget_ui_components_user_active", "widget_ui_components", ["user_id", "active"])


def downgrade() -> None:
    op.drop_index("ix_widget_ui_components_user_active", table_name="widget_ui_components")
    op.drop_index("ix_widget_ui_components_user_id", table_name="widget_ui_components")
    op.drop_table("widget_ui_components")
    op.drop_column("messages", "render_payload")
    op.drop_column("agents", "widget_response_mode")
