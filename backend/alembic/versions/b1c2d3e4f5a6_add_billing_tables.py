"""add billing tables

Revision ID: b1c2d3e4f5a6
Revises: f8a1b2c3d4e5
Create Date: 2026-01-04 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "b1c2d3e4f5a6"
down_revision = "f8a1b2c3d4e5"
branch_labels = None
depends_on = None


billing_plan_enum = postgresql.ENUM("free", "basic", "pro", "enterprise", name="billing_plan")
billing_plan_enum_no_create = postgresql.ENUM("free", "basic", "pro", "enterprise", name="billing_plan", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    billing_plan_enum.create(bind, checkfirst=True)

    op.create_table(
        "billing_accounts",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("plan", billing_plan_enum_no_create, nullable=False),
        sa.Column("monthly_action_quota", sa.Integer(), server_default="0", nullable=False),
        sa.Column("monthly_actions_remaining", sa.Integer(), server_default="0", nullable=False),
        sa.Column("topup_actions_remaining", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lifetime_actions_remaining", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lemon_customer_id", sa.Text(), nullable=True),
        sa.Column("lemon_subscription_id", sa.Text(), nullable=True),
        sa.Column("lemon_subscription_status", sa.Text(), nullable=True),
        sa.Column("lemon_subscription_variant_id", sa.Text(), nullable=True),
        sa.Column("lemon_subscription_renews_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lemon_subscription_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_billing_accounts_lemon_customer_id", "billing_accounts", ["lemon_customer_id"])
    op.create_index("ix_billing_accounts_lemon_subscription_id", "billing_accounts", ["lemon_subscription_id"])

    op.create_table(
        "billing_topup_credits",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("lemon_order_id", sa.Text(), nullable=False),
        sa.Column("actions", sa.Integer(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lemon_order_id", name="uq_billing_topup_credits_lemon_order_id"),
    )
    op.create_index("ix_billing_topup_credits_user_id", "billing_topup_credits", ["user_id"])

    op.create_table(
        "billing_action_consumptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("tool_call_id", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "conversation_id",
            "tool_call_id",
            name="uq_billing_action_consumptions_key",
        ),
    )
    op.create_index("ix_billing_action_consumptions_user_id", "billing_action_consumptions", ["user_id"])
    op.create_index("ix_billing_action_consumptions_conversation_id", "billing_action_consumptions", ["conversation_id"])


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_billing_action_consumptions_conversation_id", table_name="billing_action_consumptions")
    op.drop_index("ix_billing_action_consumptions_user_id", table_name="billing_action_consumptions")
    op.drop_table("billing_action_consumptions")

    op.drop_index("ix_billing_topup_credits_user_id", table_name="billing_topup_credits")
    op.drop_table("billing_topup_credits")

    op.drop_index("ix_billing_accounts_lemon_subscription_id", table_name="billing_accounts")
    op.drop_index("ix_billing_accounts_lemon_customer_id", table_name="billing_accounts")
    op.drop_table("billing_accounts")

    billing_plan_enum.drop(bind, checkfirst=True)
