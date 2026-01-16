"""replace widget styling columns with json

Revision ID: j5k6l7m8n9o0
Revises: i3j4k5l6m7n8
Create Date: 2026-01-16

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "j5k6l7m8n9o0"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("agents", "widget_primary_color")
    op.drop_column("agents", "widget_text_color")
    op.drop_column("agents", "widget_background_color")
    op.drop_column("agents", "widget_border_width_container")
    op.drop_column("agents", "widget_border_width_message")
    op.drop_column("agents", "widget_border_width_button")
    op.add_column(
        "agents",
        sa.Column(
            "widget_styles",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "widget_styles")
    op.add_column("agents", sa.Column("widget_border_width_button", sa.Integer(), nullable=True))
    op.add_column("agents", sa.Column("widget_border_width_message", sa.Integer(), nullable=True))
    op.add_column("agents", sa.Column("widget_border_width_container", sa.Integer(), nullable=True))
    op.add_column("agents", sa.Column("widget_background_color", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("widget_text_color", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("widget_primary_color", sa.Text(), nullable=True))
