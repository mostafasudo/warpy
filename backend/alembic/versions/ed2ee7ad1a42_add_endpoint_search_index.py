"""add endpoint search index

Revision ID: ed2ee7ad1a42
Revises: 37975598c548
Create Date: 2025-02-06 00:00:00.000000

"""
from alembic import op


revision = "ed2ee7ad1a42"
down_revision = "37975598c548"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_endpoints_search_document;")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_endpoints_path_trgm
        ON endpoints
        USING gin (lower(coalesce(path, '')) gin_trgm_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_endpoints_tool_name_trgm
        ON endpoints
        USING gin (lower(coalesce((tool->'function'->>'name'), '')) gin_trgm_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_endpoints_tool_description_trgm
        ON endpoints
        USING gin (lower(coalesce((tool->'function'->>'description'), '')) gin_trgm_ops);
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS ix_endpoints_tool_description_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_endpoints_tool_name_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_endpoints_path_trgm;")
