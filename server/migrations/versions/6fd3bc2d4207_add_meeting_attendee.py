"""add meeting_attendee

Revision ID: 6fd3bc2d4207
Revises: c1d2e3f4a5b6
Create Date: 2026-10-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "6fd3bc2d4207"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Daily sets user_id to the session id for anonymous participants.
BACKFILL_SQL = """
INSERT INTO meeting_attendee (id, meeting_id, user_id, joined_at)
SELECT gen_random_uuid()::text, src.meeting_id, src.user_id, MIN(src.joined_at)
FROM (
    SELECT s.meeting_id, s.user_id, s.joined_at
    FROM daily_participant_session s
    WHERE s.user_id IS NOT NULL AND s.user_id <> '' AND s.user_id <> s.session_id

    UNION ALL

    SELECT t.meeting_id, p.value ->> 'user_id', m.start_date
    FROM transcript t
    JOIN meeting m ON m.id = t.meeting_id
    CROSS JOIN LATERAL json_array_elements(
        CASE WHEN json_typeof(t.participants) = 'array'
        THEN t.participants ELSE '[]'::json END
    ) AS p(value)
    WHERE COALESCE(p.value ->> 'user_id', '') <> ''

    UNION ALL

    SELECT c.meeting_id, c.user_id, c.consent_timestamp
    FROM meeting_consent c
    WHERE c.user_id IS NOT NULL AND c.user_id <> ''
) AS src
JOIN meeting m ON m.id = src.meeting_id
GROUP BY src.meeting_id, src.user_id
ON CONFLICT (meeting_id, user_id) DO NOTHING
"""


def upgrade() -> None:
    op.create_table(
        "meeting_attendee",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("meeting_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meeting.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_meeting_attendee_meeting_user",
        "meeting_attendee",
        ["meeting_id", "user_id"],
        unique=True,
    )
    op.create_index("idx_meeting_attendee_user", "meeting_attendee", ["user_id"])
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.drop_index("idx_meeting_attendee_user", table_name="meeting_attendee")
    op.drop_index("idx_meeting_attendee_meeting_user", table_name="meeting_attendee")
    op.drop_table("meeting_attendee")
