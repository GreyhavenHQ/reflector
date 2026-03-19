#!/usr/bin/env python
"""
CLI tool for managing soft-deleted transcripts.

Usage:
    uv run python -m reflector.tools.deleted_transcripts list
    uv run python -m reflector.tools.deleted_transcripts files <transcript_id>
    uv run python -m reflector.tools.deleted_transcripts download <transcript_id> [--output-dir ./]
"""

import argparse
import asyncio
import json
import os

import structlog

from reflector.db import get_database
from reflector.db.meetings import meetings_controller
from reflector.db.recordings import recordings_controller
from reflector.db.transcripts import Transcript, transcripts
from reflector.storage import get_source_storage, get_transcripts_storage

logger = structlog.get_logger(__name__)


async def list_deleted():
    """List all soft-deleted transcripts."""
    database = get_database()
    await database.connect()
    try:
        query = (
            transcripts.select()
            .where(transcripts.c.deleted_at.isnot(None))
            .order_by(transcripts.c.deleted_at.desc())
        )
        results = await database.fetch_all(query)

        if not results:
            print("No deleted transcripts found.")
            return

        print(
            f"{'ID':<40} {'Title':<40} {'Deleted At':<28} {'Recording ID':<40} {'Meeting ID'}"
        )
        print("-" * 180)
        for row in results:
            t = Transcript(**row)
            title = (t.title or "")[:38]
            deleted = t.deleted_at.isoformat() if t.deleted_at else ""
            print(
                f"{t.id:<40} {title:<40} {deleted:<28} {t.recording_id or '':<40} {t.meeting_id or ''}"
            )

        print(f"\nTotal: {len(results)} deleted transcript(s)")
    finally:
        await database.disconnect()


async def list_files(transcript_id: str):
    """List all S3 keys associated with a deleted transcript."""
    database = get_database()
    await database.connect()
    try:
        query = transcripts.select().where(transcripts.c.id == transcript_id)
        result = await database.fetch_one(query)
        if not result:
            print(f"Transcript {transcript_id} not found.")
            return

        t = Transcript(**result)
        if t.deleted_at is None:
            print(f"Transcript {transcript_id} is not deleted.")
            return

        print(f"Transcript: {t.id}")
        print(f"Title: {t.title}")
        print(f"Deleted at: {t.deleted_at}")
        print()

        files = []

        # Transcript audio
        if t.audio_location == "storage" and not t.audio_deleted:
            files.append(("Transcript audio", t.storage_audio_path, None))

        # Recording files
        if t.recording_id:
            recording = await recordings_controller.get_by_id(t.recording_id)
            if recording:
                if recording.object_key:
                    files.append(
                        (
                            "Recording object_key",
                            recording.object_key,
                            recording.bucket_name,
                        )
                    )
                if recording.track_keys:
                    for i, key in enumerate(recording.track_keys):
                        files.append((f"Track {i}", key, recording.bucket_name))

        # Cloud video
        if t.meeting_id:
            meeting = await meetings_controller.get_by_id(t.meeting_id)
            if meeting and meeting.daily_composed_video_s3_key:
                files.append(("Cloud video", meeting.daily_composed_video_s3_key, None))

        if not files:
            print("No associated files found.")
            return

        print(f"{'Type':<25} {'Bucket':<30} {'S3 Key'}")
        print("-" * 120)
        for label, key, bucket in files:
            print(f"{label:<25} {bucket or '(default)':<30} {key}")

        # Generate presigned URLs
        print("\nPresigned URLs (valid for 1 hour):")
        print("-" * 120)
        storage = get_transcripts_storage()
        for label, key, bucket in files:
            try:
                url = await storage.get_file_url(key, bucket=bucket, expires_in=3600)
                print(f"{label}: {url}")
            except Exception as e:
                print(f"{label}: ERROR - {e}")
    finally:
        await database.disconnect()


async def download_files(transcript_id: str, output_dir: str):
    """Download all files associated with a deleted transcript."""
    database = get_database()
    await database.connect()
    try:
        query = transcripts.select().where(transcripts.c.id == transcript_id)
        result = await database.fetch_one(query)
        if not result:
            print(f"Transcript {transcript_id} not found.")
            return

        t = Transcript(**result)
        if t.deleted_at is None:
            print(f"Transcript {transcript_id} is not deleted.")
            return

        dest = os.path.join(output_dir, t.id)
        os.makedirs(dest, exist_ok=True)

        storage = get_transcripts_storage()

        # Download transcript audio
        if t.audio_location == "storage" and not t.audio_deleted:
            try:
                data = await storage.get_file(t.storage_audio_path)
                path = os.path.join(dest, "audio.mp3")
                with open(path, "wb") as f:
                    f.write(data)
                print(f"Downloaded: {path}")
            except Exception as e:
                print(f"Failed to download audio: {e}")

        # Download recording files
        if t.recording_id:
            recording = await recordings_controller.get_by_id(t.recording_id)
            if recording and recording.track_keys:
                tracks_dir = os.path.join(dest, "tracks")
                os.makedirs(tracks_dir, exist_ok=True)
                for i, key in enumerate(recording.track_keys):
                    try:
                        data = await storage.get_file(key, bucket=recording.bucket_name)
                        filename = os.path.basename(key) or f"track_{i}"
                        path = os.path.join(tracks_dir, filename)
                        with open(path, "wb") as f:
                            f.write(data)
                        print(f"Downloaded: {path}")
                    except Exception as e:
                        print(f"Failed to download track {i}: {e}")

        # Download cloud video
        if t.meeting_id:
            meeting = await meetings_controller.get_by_id(t.meeting_id)
            if meeting and meeting.daily_composed_video_s3_key:
                try:
                    source_storage = get_source_storage("daily")
                    data = await source_storage.get_file(
                        meeting.daily_composed_video_s3_key
                    )
                    path = os.path.join(dest, "cloud_video.mp4")
                    with open(path, "wb") as f:
                        f.write(data)
                    print(f"Downloaded: {path}")
                except Exception as e:
                    print(f"Failed to download cloud video: {e}")

        # Write metadata
        metadata = {
            "id": t.id,
            "title": t.title,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "deleted_at": t.deleted_at.isoformat() if t.deleted_at else None,
            "duration": t.duration,
            "source_language": t.source_language,
            "target_language": t.target_language,
            "short_summary": t.short_summary,
            "long_summary": t.long_summary,
            "topics": [topic.model_dump() for topic in t.topics] if t.topics else [],
            "participants": [p.model_dump() for p in t.participants]
            if t.participants
            else [],
            "action_items": t.action_items,
            "webvtt": t.webvtt,
            "recording_id": t.recording_id,
            "meeting_id": t.meeting_id,
        }
        path = os.path.join(dest, "metadata.json")
        with open(path, "w") as f:
            json.dump(metadata, f, indent=2, default=str)
        print(f"Downloaded: {path}")

        print(f"\nAll files saved to: {dest}")
    finally:
        await database.disconnect()


def main():
    parser = argparse.ArgumentParser(description="Manage soft-deleted transcripts")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List all deleted transcripts")

    files_parser = subparsers.add_parser(
        "files", help="List S3 keys for a deleted transcript"
    )
    files_parser.add_argument("transcript_id", help="Transcript ID")

    download_parser = subparsers.add_parser(
        "download", help="Download files for a deleted transcript"
    )
    download_parser.add_argument("transcript_id", help="Transcript ID")
    download_parser.add_argument(
        "--output-dir", default=".", help="Output directory (default: .)"
    )

    args = parser.parse_args()

    if args.command == "list":
        asyncio.run(list_deleted())
    elif args.command == "files":
        asyncio.run(list_files(args.transcript_id))
    elif args.command == "download":
        asyncio.run(download_files(args.transcript_id, args.output_dir))


if __name__ == "__main__":
    main()
