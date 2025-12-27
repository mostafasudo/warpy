"""add widget install prefs to agents

Revision ID: d2f9a4b1c7de
Revises: ec2a50317db2
Create Date: 2025-12-27 05:12:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "d2f9a4b1c7de"
down_revision = "ec2a50317db2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("widget_install_framework", sa.Text(), nullable=False, server_default=sa.text("'react'")),
    )
    op.add_column(
        "agents",
        sa.Column("widget_install_package_manager", sa.Text(), nullable=False, server_default=sa.text("'npm'")),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_install_package_manager")
    op.drop_column("agents", "widget_install_framework")
