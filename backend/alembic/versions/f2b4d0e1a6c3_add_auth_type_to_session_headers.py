"""add auth type to session headers

Revision ID: f2b4d0e1a6c3
Revises: bc7c6b5a4f31
Create Date: 2025-12-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "f2b4d0e1a6c3"
down_revision = "bc7c6b5a4f31"
branch_labels = None
depends_on = None


auth_type_enum = sa.Enum("bearer", "basic", "none", name="auth_type")


def upgrade() -> None:
    bind = op.get_bind()
    auth_type_enum.bind = bind
    auth_type_enum.create(bind, checkfirst=True)
    with op.batch_alter_table("session_headers") as batch:
        batch.add_column(sa.Column("auth_type", auth_type_enum, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table("session_headers") as batch:
        batch.drop_column("auth_type")
    auth_type_enum.bind = bind
    auth_type_enum.drop(bind, checkfirst=True)
