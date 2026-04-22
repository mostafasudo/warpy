"""merge user api key and mcp heads

Revision ID: b8d9e0f1a2b3
Revises: aa11bb22cc33, a7c8d9e0f1a2
Create Date: 2026-04-22 02:45:00.000000

"""

from typing import Sequence, Union


revision: str = "b8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = ("aa11bb22cc33", "a7c8d9e0f1a2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
