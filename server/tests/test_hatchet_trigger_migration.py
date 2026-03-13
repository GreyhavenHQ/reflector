"""
Tests verifying Celery-to-Hatchet trigger migration.

Ensures that:
1. process_recording triggers FilePipeline via Hatchet (not Celery)
2. transcript_record_upload triggers FilePipeline via Hatchet (not Celery)
3. Old Celery task references are no longer in active call sites
"""


def test_process_recording_does_not_import_celery_file_task():
    """Verify process.py no longer imports task_pipeline_file_process."""
    import inspect

    from reflector.worker import process

    source = inspect.getsource(process)
    # Should not contain the old Celery task import
    assert "task_pipeline_file_process" not in source


def test_transcripts_upload_does_not_import_celery_file_task():
    """Verify transcripts_upload.py no longer imports task_pipeline_file_process."""
    import inspect

    from reflector.views import transcripts_upload

    source = inspect.getsource(transcripts_upload)
    # Should not contain the old Celery task import
    assert "task_pipeline_file_process" not in source


def test_transcripts_upload_imports_hatchet():
    """Verify transcripts_upload.py imports HatchetClientManager."""
    import inspect

    from reflector.views import transcripts_upload

    source = inspect.getsource(transcripts_upload)
    assert "HatchetClientManager" in source


def test_pipeline_post_is_async():
    """Verify pipeline_post is now async (Hatchet trigger)."""
    import asyncio

    from reflector.pipelines.main_live_pipeline import pipeline_post

    assert asyncio.iscoroutinefunction(pipeline_post)


def test_transcript_process_service_does_not_import_celery_file_task():
    """Verify transcript_process.py service no longer imports task_pipeline_file_process."""
    import inspect

    from reflector.services import transcript_process

    source = inspect.getsource(transcript_process)
    assert "task_pipeline_file_process" not in source


def test_transcript_process_service_dispatch_uses_hatchet():
    """Verify dispatch_transcript_processing uses HatchetClientManager for file processing."""
    import inspect

    from reflector.services import transcript_process

    source = inspect.getsource(transcript_process.dispatch_transcript_processing)
    assert "HatchetClientManager" in source
    assert "FilePipeline" in source


def test_new_task_names_exist():
    """Verify new TaskName constants were added for file and live pipelines."""
    from reflector.hatchet.constants import TaskName

    # File pipeline tasks
    assert TaskName.EXTRACT_AUDIO == "extract_audio"
    assert TaskName.UPLOAD_AUDIO == "upload_audio"
    assert TaskName.TRANSCRIBE == "transcribe"
    assert TaskName.DIARIZE == "diarize"
    assert TaskName.ASSEMBLE_TRANSCRIPT == "assemble_transcript"
    assert TaskName.GENERATE_SUMMARIES == "generate_summaries"

    # Live post-processing pipeline tasks
    assert TaskName.WAVEFORM == "waveform"
    assert TaskName.CONVERT_MP3 == "convert_mp3"
    assert TaskName.UPLOAD_MP3 == "upload_mp3"
    assert TaskName.REMOVE_UPLOAD == "remove_upload"
    assert TaskName.FINAL_SUMMARIES == "final_summaries"
