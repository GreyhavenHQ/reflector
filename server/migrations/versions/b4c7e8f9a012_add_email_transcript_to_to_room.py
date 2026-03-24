"""add email_transcript_to to room

Revision ID: b4c7e8f9a012
Revises: a2b3c4d5e6f7
Create Date: 2026-03-24 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4c7e8f9a012"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "room",
        sa.Column("email_transcript_to", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("room", "email_transcript_to")
