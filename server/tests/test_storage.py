"""Tests for storage abstraction layer."""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from reflector.storage.base import StoragePermissionError
from reflector.storage.storage_aws import AwsStorage


@pytest.mark.asyncio
async def test_aws_storage_stream_to_fileobj():
    """Test that AWS storage can stream directly to a file object without loading into memory."""
    # Setup
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock download_fileobj to write data
    async def mock_download(Bucket, Key, Fileobj, **kwargs):
        Fileobj.write(b"chunk1chunk2")

    mock_client = AsyncMock()
    mock_client.download_fileobj = AsyncMock(side_effect=mock_download)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    # Patch the session client
    with patch.object(storage.session, "client", return_value=mock_client):
        # Create a file-like object to stream to
        output = io.BytesIO()

        # Act - stream to file object
        await storage.stream_to_fileobj("test-file.mp4", output, bucket="test-bucket")

        # Assert
        mock_client.download_fileobj.assert_called_once_with(
            Bucket="test-bucket", Key="test-file.mp4", Fileobj=output
        )

        # Check that data was written to output
        output.seek(0)
        assert output.read() == b"chunk1chunk2"


@pytest.mark.asyncio
async def test_aws_storage_stream_to_fileobj_with_folder():
    """Test streaming with folder prefix in bucket name."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket/recordings",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    async def mock_download(Bucket, Key, Fileobj, **kwargs):
        Fileobj.write(b"data")

    mock_client = AsyncMock()
    mock_client.download_fileobj = AsyncMock(side_effect=mock_download)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        output = io.BytesIO()
        await storage.stream_to_fileobj("file.mp4", output, bucket="other-bucket")

        # Should use folder prefix from instance config
        mock_client.download_fileobj.assert_called_once_with(
            Bucket="other-bucket", Key="recordings/file.mp4", Fileobj=output
        )


@pytest.mark.asyncio
async def test_storage_base_class_stream_to_fileobj():
    """Test that base Storage class has stream_to_fileobj method."""
    from reflector.storage.base import Storage

    # Verify method exists in base class
    assert hasattr(Storage, "stream_to_fileobj")

    # Create a mock storage instance
    storage = MagicMock(spec=Storage)
    storage.stream_to_fileobj = AsyncMock()

    # Should be callable
    await storage.stream_to_fileobj("file.mp4", io.BytesIO())
    storage.stream_to_fileobj.assert_called_once()


@pytest.mark.asyncio
async def test_aws_storage_stream_uses_download_fileobj():
    """Test that download_fileobj is called correctly."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    async def mock_download(Bucket, Key, Fileobj, **kwargs):
        Fileobj.write(b"data")

    mock_client = AsyncMock()
    mock_client.download_fileobj = AsyncMock(side_effect=mock_download)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        output = io.BytesIO()
        await storage.stream_to_fileobj("test.mp4", output)

        # Verify download_fileobj was called with correct parameters
        mock_client.download_fileobj.assert_called_once_with(
            Bucket="test-bucket", Key="test.mp4", Fileobj=output
        )


@pytest.mark.asyncio
async def test_aws_storage_handles_access_denied_error():
    """Test that AccessDenied errors are caught and wrapped in StoragePermissionError."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError with AccessDenied
    error_response = {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}
    mock_client = AsyncMock()
    mock_client.put_object = AsyncMock(
        side_effect=ClientError(error_response, "PutObject")
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        with pytest.raises(StoragePermissionError) as exc_info:
            await storage.put_file("test.txt", b"data")

        # Verify error message contains expected information
        error_msg = str(exc_info.value)
        assert "AccessDenied" in error_msg
        assert "default bucket 'test-bucket'" in error_msg
        assert "S3 upload failed" in error_msg


@pytest.mark.asyncio
async def test_aws_storage_handles_no_such_bucket_error():
    """Test that NoSuchBucket errors are caught and wrapped in StoragePermissionError."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError with NoSuchBucket
    error_response = {
        "Error": {
            "Code": "NoSuchBucket",
            "Message": "The specified bucket does not exist",
        }
    }
    mock_client = AsyncMock()
    mock_client.delete_object = AsyncMock(
        side_effect=ClientError(error_response, "DeleteObject")
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        with pytest.raises(StoragePermissionError) as exc_info:
            await storage.delete_file("test.txt")

        # Verify error message contains expected information
        error_msg = str(exc_info.value)
        assert "NoSuchBucket" in error_msg
        assert "default bucket 'test-bucket'" in error_msg
        assert "S3 delete failed" in error_msg


@pytest.mark.asyncio
async def test_aws_storage_error_message_with_bucket_override():
    """Test that error messages correctly show overridden bucket."""
    storage = AwsStorage(
        aws_bucket_name="default-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError with AccessDenied
    error_response = {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}
    mock_client = AsyncMock()
    mock_client.get_object = AsyncMock(
        side_effect=ClientError(error_response, "GetObject")
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        with pytest.raises(StoragePermissionError) as exc_info:
            await storage.get_file("test.txt", bucket="override-bucket")

        # Verify error message shows overridden bucket, not default
        error_msg = str(exc_info.value)
        assert "overridden bucket 'override-bucket'" in error_msg
        assert "default-bucket" not in error_msg
        assert "S3 download failed" in error_msg


@pytest.mark.asyncio
async def test_aws_storage_reraises_non_handled_errors():
    """Test that non-AccessDenied/NoSuchBucket errors are re-raised as-is."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError with different error code
    error_response = {
        "Error": {"Code": "InternalError", "Message": "Internal Server Error"}
    }
    mock_client = AsyncMock()
    mock_client.put_object = AsyncMock(
        side_effect=ClientError(error_response, "PutObject")
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        # Should raise ClientError, not StoragePermissionError
        with pytest.raises(ClientError) as exc_info:
            await storage.put_file("test.txt", b"data")

        # Verify it's the original ClientError
        assert exc_info.value.response["Error"]["Code"] == "InternalError"


@pytest.mark.asyncio
async def test_aws_storage_presign_url_handles_errors():
    """Test that presigned URL generation handles permission errors."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError with AccessDenied during presign operation
    error_response = {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}
    mock_client = AsyncMock()
    mock_client.generate_presigned_url = AsyncMock(
        side_effect=ClientError(error_response, "GeneratePresignedUrl")
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        with pytest.raises(StoragePermissionError) as exc_info:
            await storage.get_file_url("test.txt")

        # Verify error message
        error_msg = str(exc_info.value)
        assert "S3 presign failed" in error_msg
        assert "AccessDenied" in error_msg


@pytest.mark.asyncio
async def test_aws_storage_list_objects_handles_errors():
    """Test that list_objects handles permission errors."""
    storage = AwsStorage(
        aws_bucket_name="test-bucket",
        aws_region="us-east-1",
        aws_access_key_id="test-key",
        aws_secret_access_key="test-secret",
    )

    # Mock ClientError during list operation
    error_response = {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}
    mock_paginator = MagicMock()

    async def mock_paginate(*args, **kwargs):
        raise ClientError(error_response, "ListObjectsV2")
        yield  # Make it an async generator

    mock_paginator.paginate = mock_paginate

    mock_client = AsyncMock()
    mock_client.get_paginator = MagicMock(return_value=mock_paginator)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch.object(storage.session, "client", return_value=mock_client):
        with pytest.raises(StoragePermissionError) as exc_info:
            await storage.list_objects(prefix="test/")

        error_msg = str(exc_info.value)
        assert "S3 list_objects failed" in error_msg
        assert "AccessDenied" in error_msg


def test_aws_storage_constructor_rejects_mixed_auth():
    """Test that constructor rejects both role_arn and access keys."""
    with pytest.raises(ValueError, match="cannot use both.*role_arn.*access keys"):
        AwsStorage(
            aws_bucket_name="test-bucket",
            aws_region="us-east-1",
            aws_access_key_id="test-key",
            aws_secret_access_key="test-secret",
            aws_role_arn="arn:aws:iam::123456789012:role/test-role",
        )


@pytest.mark.asyncio
async def test_aws_storage_custom_endpoint_url():
    """Test that custom endpoint_url configures path-style addressing and passes endpoint to client."""
    storage = AwsStorage(
        aws_bucket_name="reflector-media",
        aws_region="garage",
        aws_access_key_id="GKtest",
        aws_secret_access_key="secret",
        aws_endpoint_url="http://garage:3900",
    )
    assert storage._endpoint_url == "http://garage:3900"
    assert storage.boto_config.s3["addressing_style"] == "path"
    assert storage.base_url == "http://garage:3900/reflector-media/"
    # retries config preserved (merge, not replace)
    assert storage.boto_config.retries["max_attempts"] == 3

    mock_client = AsyncMock()
    mock_client.put_object = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.generate_presigned_url = AsyncMock(
        return_value="http://garage:3900/reflector-media/test.txt"
    )

    with patch.object(
        storage.session, "client", return_value=mock_client
    ) as mock_session_client:
        await storage.put_file("test.txt", b"data")
        mock_session_client.assert_called_with(
            "s3", config=storage.boto_config, endpoint_url="http://garage:3900"
        )


@pytest.mark.asyncio
async def test_aws_storage_none_endpoint_url():
    """Test that None endpoint preserves current AWS behavior."""
    storage = AwsStorage(
        aws_bucket_name="reflector-bucket",
        aws_region="us-east-1",
        aws_access_key_id="AKIAtest",
        aws_secret_access_key="secret",
    )
    assert storage._endpoint_url is None
    assert storage.base_url == "https://reflector-bucket.s3.amazonaws.com/"
    # No s3 addressing_style override — boto_config should only have retries
    assert not hasattr(storage.boto_config, "s3") or storage.boto_config.s3 is None


# --- Tests for get_source_storage() ---


def test_get_source_storage_daily_with_credentials():
    """Daily platform with access keys returns AwsStorage with Daily credentials."""
    with patch("reflector.storage.settings") as mock_settings:
        mock_settings.DAILYCO_STORAGE_AWS_ACCESS_KEY_ID = "daily-key"
        mock_settings.DAILYCO_STORAGE_AWS_SECRET_ACCESS_KEY = "daily-secret"
        mock_settings.DAILYCO_STORAGE_AWS_BUCKET_NAME = "daily-bucket"
        mock_settings.DAILYCO_STORAGE_AWS_REGION = "us-west-2"

        from reflector.storage import get_source_storage

        storage = get_source_storage("daily")

        assert isinstance(storage, AwsStorage)
        assert storage._bucket_name == "daily-bucket"
        assert storage._region == "us-west-2"
        assert storage._access_key_id == "daily-key"
        assert storage._secret_access_key == "daily-secret"
        assert storage._endpoint_url is None


def test_get_source_storage_daily_falls_back_without_credentials():
    """Daily platform without access keys falls back to transcript storage."""
    with patch("reflector.storage.settings") as mock_settings:
        mock_settings.DAILYCO_STORAGE_AWS_ACCESS_KEY_ID = None
        mock_settings.DAILYCO_STORAGE_AWS_SECRET_ACCESS_KEY = None
        mock_settings.DAILYCO_STORAGE_AWS_BUCKET_NAME = "daily-bucket"
        mock_settings.TRANSCRIPT_STORAGE_BACKEND = "aws"
        mock_settings.TRANSCRIPT_STORAGE_AWS_BUCKET_NAME = "transcript-bucket"
        mock_settings.TRANSCRIPT_STORAGE_AWS_REGION = "us-east-1"
        mock_settings.TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID = "transcript-key"
        mock_settings.TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY = "transcript-secret"
        mock_settings.TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL = None

        from reflector.storage import get_source_storage

        with patch("reflector.storage.get_transcripts_storage") as mock_get_transcripts:
            fallback = AwsStorage(
                aws_bucket_name="transcript-bucket",
                aws_region="us-east-1",
                aws_access_key_id="transcript-key",
                aws_secret_access_key="transcript-secret",
            )
            mock_get_transcripts.return_value = fallback

            storage = get_source_storage("daily")

            mock_get_transcripts.assert_called_once()
            assert storage is fallback


def test_get_source_storage_whereby_with_credentials():
    """Whereby platform with access keys returns AwsStorage with Whereby credentials."""
    with patch("reflector.storage.settings") as mock_settings:
        mock_settings.WHEREBY_STORAGE_AWS_ACCESS_KEY_ID = "whereby-key"
        mock_settings.WHEREBY_STORAGE_AWS_SECRET_ACCESS_KEY = "whereby-secret"
        mock_settings.WHEREBY_STORAGE_AWS_BUCKET_NAME = "whereby-bucket"
        mock_settings.WHEREBY_STORAGE_AWS_REGION = "eu-west-1"

        from reflector.storage import get_source_storage

        storage = get_source_storage("whereby")

        assert isinstance(storage, AwsStorage)
        assert storage._bucket_name == "whereby-bucket"
        assert storage._region == "eu-west-1"
        assert storage._access_key_id == "whereby-key"
        assert storage._secret_access_key == "whereby-secret"


def test_get_source_storage_unknown_platform_falls_back():
    """Unknown platform falls back to transcript storage."""
    with patch("reflector.storage.settings"):
        from reflector.storage import get_source_storage

        with patch("reflector.storage.get_transcripts_storage") as mock_get_transcripts:
            fallback = MagicMock()
            mock_get_transcripts.return_value = fallback

            storage = get_source_storage("unknown-platform")

            mock_get_transcripts.assert_called_once()
            assert storage is fallback


@pytest.mark.asyncio
async def test_source_storage_presigns_for_correct_bucket():
    """Source storage presigns URLs using the platform's credentials and the override bucket."""
    with patch("reflector.storage.settings") as mock_settings:
        mock_settings.DAILYCO_STORAGE_AWS_ACCESS_KEY_ID = "daily-key"
        mock_settings.DAILYCO_STORAGE_AWS_SECRET_ACCESS_KEY = "daily-secret"
        mock_settings.DAILYCO_STORAGE_AWS_BUCKET_NAME = "daily-bucket"
        mock_settings.DAILYCO_STORAGE_AWS_REGION = "us-west-2"

        from reflector.storage import get_source_storage

        storage = get_source_storage("daily")

        mock_client = AsyncMock()
        mock_client.generate_presigned_url = AsyncMock(
            return_value="https://daily-bucket.s3.amazonaws.com/track.webm?signed"
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch.object(storage.session, "client", return_value=mock_client):
            url = await storage.get_file_url(
                "track.webm",
                operation="get_object",
                expires_in=3600,
                bucket="override-bucket",
            )

            assert "track.webm" in url
            mock_client.generate_presigned_url.assert_called_once()
            call_kwargs = mock_client.generate_presigned_url.call_args
            params = call_kwargs[1].get("Params") or call_kwargs[0][1]
            assert params["Bucket"] == "override-bucket"
            assert params["Key"] == "track.webm"
