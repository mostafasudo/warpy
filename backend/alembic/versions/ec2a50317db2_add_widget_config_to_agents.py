"""add widget config to agents

Revision ID: ec2a50317db2
Revises: 7b3c2d1e8f4a
Create Date: 2025-12-26 19:52:52.415019

"""
from alembic import op
import sqlalchemy as sa


revision = "ec2a50317db2"
down_revision = "7b3c2d1e8f4a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_title", sa.Text(), nullable=False, server_default=sa.text("'Warpy'")),
    )
    op.add_column(
        "agents",
        sa.Column("widget_subtitle", sa.Text(), nullable=False, server_default=sa.text("'Ready to act'")),
    )
    op.add_column(
        "agents",
        sa.Column("widget_icon_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("widget_empty_title", sa.Text(), nullable=False, server_default=sa.text("'What would you like to do?'")),
    )
    op.add_column(
        "agents",
        sa.Column(
            "widget_empty_description",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'Ask a question, request help, or describe what you want to get done.'"),
        ),
    )
    op.add_column(
        "agents",
        sa.Column("widget_input_placeholder", sa.Text(), nullable=False, server_default=sa.text("'Ask Warpy…'")),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_input_placeholder")
    op.drop_column("agents", "widget_empty_description")
    op.drop_column("agents", "widget_empty_title")
    op.drop_column("agents", "widget_icon_url")
    op.drop_column("agents", "widget_subtitle")
    op.drop_column("agents", "widget_title")
