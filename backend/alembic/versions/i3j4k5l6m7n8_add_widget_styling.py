"""add widget styling columns

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-01-15

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("widget_primary_color", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("widget_text_color", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("widget_background_color", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("widget_border_width_container", sa.Integer(), nullable=True))
    op.add_column("agents", sa.Column("widget_border_width_message", sa.Integer(), nullable=True))
    op.add_column("agents", sa.Column("widget_border_width_button", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "widget_border_width_button")
    op.drop_column("agents", "widget_border_width_message")
    op.drop_column("agents", "widget_border_width_container")
    op.drop_column("agents", "widget_background_color")
    op.drop_column("agents", "widget_text_color")
    op.drop_column("agents", "widget_primary_color")
