"""add mcp connections

Revision ID: aa11bb22cc33
Revises: z6b7c8d9e0f1
Create Date: 2026-04-19 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "aa11bb22cc33"
down_revision: Union[str, None] = "z6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    headers_type = sa.dialects.postgresql.JSONB() if is_pg else sa.JSON()
    if is_pg:
        auth_mode_enum = sa.dialects.postgresql.ENUM(
            "none",
            "static_headers",
            "token_exchange",
            name="mcp_auth_mode",
            create_type=False,
        )
        auth_mode_enum.create(bind, checkfirst=True)
    else:
        auth_mode_enum = sa.Enum("none", "static_headers", "token_exchange", name="mcp_auth_mode")

    op.create_table(
        "mcp_connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("server_url", sa.Text(), nullable=False),
        sa.Column("auth_mode", auth_mode_enum, nullable=False, server_default="none"),
        sa.Column("static_headers", headers_type, nullable=True),
        sa.Column("token_exchange_path", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_connections_user_id", "mcp_connections", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        auth_mode_enum = sa.dialects.postgresql.ENUM(
            "none",
            "static_headers",
            "token_exchange",
            name="mcp_auth_mode",
            create_type=False,
        )
    else:
        auth_mode_enum = sa.Enum("none", "static_headers", "token_exchange", name="mcp_auth_mode")
    op.drop_index("ix_mcp_connections_user_id", table_name="mcp_connections")
    op.drop_table("mcp_connections")
    auth_mode_enum.drop(bind, checkfirst=True)
