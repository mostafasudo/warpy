"""merge activity and billing heads

Revision ID: c0b1a2d3e4f5
Revises: a9c3d7e1f2b4, b1c2d3e4f5a6
Create Date: 2026-01-09 00:00:00.000000

"""
from typing import Sequence, Union


revision: str = "c0b1a2d3e4f5"
down_revision: Union[str, Sequence[str], None] = ("a9c3d7e1f2b4", "b1c2d3e4f5a6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
