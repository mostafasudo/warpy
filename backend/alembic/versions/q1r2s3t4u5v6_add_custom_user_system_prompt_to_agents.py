"""add custom user system prompt to agents

Revision ID: q1r2s3t4u5v6
Revises: p1q2r3s4t5u6
Create Date: 2026-03-07 03:15:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa

DEFAULT_CUSTOM_USER_SYSTEM_PROMPT = (
    "You are a helpful copilot for this SaaS product. Help users find features, "
    "understand workflows, solve problems, and complete tasks. Be concise, friendly, "
    "and proactive. If someone seems stuck, suggest the next best step. Avoid technical "
    "jargon unless the user is clearly technical. Offer step-by-step guidance when it "
    "would help."
)


revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column(
            "custom_user_system_prompt",
            sa.Text(),
            nullable=False,
            server_default=DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "custom_user_system_prompt")
