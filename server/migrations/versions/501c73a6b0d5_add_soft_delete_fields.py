"""add soft delete fields to transcript and recording

Revision ID: 501c73a6b0d5
Revises: e1f093f7f124
Create Date: 2026-03-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "501c73a6b0d5"
down_revision: Union[str, None] = "e1f093f7f124"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transcript",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "recording",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_transcript_not_deleted",
        "transcript",
        ["id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_recording_not_deleted",
        "recording",
        ["id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_recording_not_deleted", table_name="recording")
    op.drop_index("idx_transcript_not_deleted", table_name="transcript")
    op.drop_column("recording", "deleted_at")
    op.drop_column("transcript", "deleted_at")
