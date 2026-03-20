"""add email_recipients to meeting

Revision ID: a2b3c4d5e6f7
Revises: 501c73a6b0d5
Create Date: 2026-03-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "501c73a6b0d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meeting",
        sa.Column("email_recipients", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meeting", "email_recipients")
