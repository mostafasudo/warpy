"""add features and feature link

Revision ID: c7f5e2a1c123
Revises: f2b4d0e1a6c3
Create Date: 2025-12-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import uuid
import datetime


revision = "c7f5e2a1c123"
down_revision = "f2b4d0e1a6c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "features",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_feature_user_name")
    )
    op.create_index("ix_features_user_id", "features", ["user_id"], unique=False)

    op.add_column("endpoints", sa.Column("feature_id", sa.UUID(), nullable=True))
    op.create_index("ix_endpoints_feature_id", "endpoints", ["feature_id"], unique=False)
    op.create_foreign_key(
        "fk_endpoints_feature_id",
        "endpoints",
        "features",
        ["feature_id"],
        ["id"],
        ondelete="CASCADE"
    )

    bind = op.get_bind()
    endpoints = bind.execute(sa.text("SELECT id, user_id FROM endpoints")).fetchall()
    features_by_user: dict[str, uuid.UUID] = {}
    timestamp = datetime.datetime.utcnow()
    for endpoint_id, user_id in endpoints:
        if user_id not in features_by_user:
            feature_id = uuid.uuid4()
            bind.execute(
                sa.text(
                    "INSERT INTO features (id, user_id, name, created_at, updated_at) VALUES (:id, :user_id, :name, :created_at, :updated_at)"
                ),
                {
                    "id": feature_id,
                    "user_id": user_id,
                    "name": "General",
                    "created_at": timestamp,
                    "updated_at": timestamp
                }
            )
            features_by_user[user_id] = feature_id
        bind.execute(
            sa.text("UPDATE endpoints SET feature_id = :feature_id WHERE id = :endpoint_id"),
            {"feature_id": features_by_user[user_id], "endpoint_id": endpoint_id}
        )

    op.alter_column("endpoints", "feature_id", existing_type=sa.UUID(), nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_endpoints_feature_id", "endpoints", type_="foreignkey")
    op.drop_index("ix_endpoints_feature_id", table_name="endpoints")
    op.drop_column("endpoints", "feature_id")
    op.drop_index("ix_features_user_id", table_name="features")
    op.drop_table("features")
