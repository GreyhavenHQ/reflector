"""
Minimal FastAPI mock for Daily.co API.

Serves canned responses for:
- GET /v1/recordings/{recording_id}
- GET /v1/meetings/{meeting_id}/participants
"""

from fastapi import FastAPI

app = FastAPI(title="Mock Daily API")


# Participant UUIDs must be 36-char hex UUIDs to match Daily's filename format
PARTICIPANT_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PARTICIPANT_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

# Daily-format track keys: {recording_start_ts}-{participant_id}-cam-audio-{track_start_ts}
TRACK_KEYS = [
    f"1700000000000-{PARTICIPANT_A_ID}-cam-audio-1700000001000",
    f"1700000000000-{PARTICIPANT_B_ID}-cam-audio-1700000001000",
]


@app.get("/v1/recordings/{recording_id}")
async def get_recording(recording_id: str):
    return {
        "id": recording_id,
        "room_name": "integration-test-room",
        "start_ts": 1700000000,
        "type": "raw-tracks",
        "status": "finished",
        "max_participants": 2,
        "duration": 5,
        "share_token": None,
        "s3": {
            "bucket_name": "reflector-media",
            "bucket_region": "garage",
            "key": None,
            "endpoint": None,
        },
        "s3key": None,
        "tracks": [
            {"type": "audio", "s3Key": key, "size": 100000} for key in TRACK_KEYS
        ],
        "mtgSessionId": "mock-mtg-session-id",
    }


@app.get("/v1/meetings/{meeting_id}/participants")
async def get_meeting_participants(meeting_id: str):
    return {
        "data": [
            {
                "user_id": "user-a",
                "participant_id": PARTICIPANT_A_ID,
                "user_name": "Speaker A",
                "join_time": 1700000000,
                "duration": 300,
            },
            {
                "user_id": "user-b",
                "participant_id": PARTICIPANT_B_ID,
                "user_name": "Speaker B",
                "join_time": 1700000010,
                "duration": 290,
            },
        ]
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
