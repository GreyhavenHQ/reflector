"""Logged-in users who joined a meeting, on any video platform."""

from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from reflector.db import get_database, metadata
from reflector.utils import generate_uuid4
from reflector.utils.string import NonEmptyString

meeting_attendees = sa.Table(
    "meeting_attendee",
    metadata,
    sa.Column("id", sa.String, primary_key=True),
    sa.Column(
        "meeting_id",
        sa.String,
        sa.ForeignKey("meeting.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("user_id", sa.String, nullable=False),
    sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
    sa.Index("idx_meeting_attendee_meeting_user", "meeting_id", "user_id", unique=True),
    sa.Index("idx_meeting_attendee_user", "user_id"),
)


class MeetingAttendeeController:
    async def add(
        self,
        meeting_id: NonEmptyString,
        user_id: NonEmptyString,
        joined_at: datetime | None = None,
    ) -> None:
        await self.add_many(meeting_id, [user_id], joined_at)

    async def add_many(
        self,
        meeting_id: NonEmptyString,
        user_ids: list[NonEmptyString],
        joined_at: datetime | None = None,
    ) -> None:
        if not user_ids:
            return
        joined_at = joined_at or datetime.now(timezone.utc)
        query = insert(meeting_attendees).values(
            [
                {
                    "id": generate_uuid4(),
                    "meeting_id": meeting_id,
                    "user_id": user_id,
                    "joined_at": joined_at,
                }
                for user_id in set(user_ids)
            ]
        )
        query = query.on_conflict_do_nothing(index_elements=["meeting_id", "user_id"])
        await get_database().execute(query)

    async def is_attendee(
        self, meeting_id: NonEmptyString, user_id: NonEmptyString
    ) -> bool:
        query = sa.select(meeting_attendees.c.id).where(
            meeting_attendees.c.meeting_id == meeting_id,
            meeting_attendees.c.user_id == user_id,
        )
        return await get_database().fetch_val(query) is not None

    def meeting_ids_subquery(self, user_id: NonEmptyString):
        return sa.select(meeting_attendees.c.meeting_id).where(
            meeting_attendees.c.user_id == user_id
        )


meeting_attendees_controller = MeetingAttendeeController()
