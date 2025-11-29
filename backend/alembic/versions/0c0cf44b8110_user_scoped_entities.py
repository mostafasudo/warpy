"""user scoped entities

Revision ID: 0c0cf44b8110
Revises: ed2ee7ad1a42
Create Date: 2025-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0c0cf44b8110"
down_revision = "ed2ee7ad1a42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM endpoints;")
    op.execute("DELETE FROM session_headers;")
    op.execute("DELETE FROM environments;")

    with op.batch_alter_table("environments") as batch:
        batch.add_column(sa.Column("user_id", sa.Text(), nullable=False))
        batch.create_index("ix_environments_user_id", ["user_id"], unique=False)
        batch.drop_constraint("environments_name_key", type_="unique")
        batch.create_unique_constraint("uq_environments_user_name", ["user_id", "name"])

    with op.batch_alter_table("session_headers") as batch:
        batch.add_column(sa.Column("user_id", sa.Text(), nullable=False))
        batch.create_index("ix_session_headers_user_id", ["user_id"], unique=False)
        batch.drop_constraint("uq_session_headers_header_source_key", type_="unique")
        batch.create_unique_constraint(
            "uq_session_headers_user_header_source_key",
            ["user_id", "header_name", "source", "key"]
        )

    with op.batch_alter_table("endpoints") as batch:
        batch.add_column(sa.Column("user_id", sa.Text(), nullable=False))
        batch.create_index("ix_endpoints_user_id", ["user_id"], unique=False)
        batch.drop_constraint("uq_endpoint_path_method", type_="unique")
        batch.create_unique_constraint("uq_endpoint_user_path_method", ["user_id", "path", "method"])


def downgrade() -> None:
    with op.batch_alter_table("endpoints") as batch:
        batch.drop_constraint("uq_endpoint_user_path_method", type_="unique")
        batch.create_unique_constraint("uq_endpoint_path_method", ["path", "method"])
        batch.drop_index("ix_endpoints_user_id")
        batch.drop_column("user_id")

    with op.batch_alter_table("session_headers") as batch:
        batch.drop_constraint("uq_session_headers_user_header_source_key", type_="unique")
        batch.create_unique_constraint("uq_session_headers_header_source_key", ["header_name", "source", "key"])
        batch.drop_index("ix_session_headers_user_id")
        batch.drop_column("user_id")

    with op.batch_alter_table("environments") as batch:
        batch.drop_constraint("uq_environments_user_name", type_="unique")
        batch.create_unique_constraint("environments_name_key", ["name"])
        batch.drop_index("ix_environments_user_id")
        batch.drop_column("user_id")
