"""Tests for LLM structured output with astructured_predict + reflection retry"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel, Field, ValidationError

from reflector.llm import LLM, LLMParseError
from reflector.utils.retry import RetryException


class TestResponse(BaseModel):
    """Test response model for structured output"""

    title: str = Field(description="A title")
    summary: str = Field(description="A summary")
    confidence: float = Field(description="Confidence score", ge=0, le=1)


class TestLLMParseErrorRecovery:
    """Test parse error recovery with astructured_predict reflection loop"""

    @pytest.mark.asyncio
    async def test_parse_error_recovery_with_feedback(self, test_settings):
        """Test that parse errors trigger retry with reflection prompt"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        call_count = {"count": 0}

        async def astructured_predict_handler(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                # First call: raise ValidationError (missing fields)
                raise ValidationError.from_exception_data(
                    title="TestResponse",
                    line_errors=[
                        {
                            "type": "missing",
                            "loc": ("summary",),
                            "msg": "Field required",
                            "input": {"title": "Test"},
                        }
                    ],
                )
            else:
                # Second call: should have reflection in the prompt
                assert "reflection" in kwargs
                assert "could not be parsed" in kwargs["reflection"]
                assert "Error:" in kwargs["reflection"]
                return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=astructured_predict_handler
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"
            assert result.summary == "Summary"
            assert result.confidence == 0.95
            assert call_count["count"] == 2

    @pytest.mark.asyncio
    async def test_max_parse_retry_attempts(self, test_settings):
        """Test that parse error retry stops after max attempts"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        # Always raise ValidationError
        async def always_fail(output_cls, prompt_tmpl, **kwargs):
            raise ValidationError.from_exception_data(
                title="TestResponse",
                line_errors=[
                    {
                        "type": "missing",
                        "loc": ("summary",),
                        "msg": "Field required",
                        "input": {},
                    }
                ],
            )

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(side_effect=always_fail)

            with pytest.raises(LLMParseError, match="Failed to parse"):
                await llm.get_structured_response(
                    prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
                )

            expected_attempts = test_settings.LLM_PARSE_MAX_RETRIES + 1
            assert mock_settings.llm.astructured_predict.call_count == expected_attempts

    @pytest.mark.asyncio
    async def test_raw_response_logging_on_parse_error(self, test_settings, caplog):
        """Test that raw response is logged when parse error occurs"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        call_count = {"count": 0}

        async def astructured_predict_handler(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                raise ValidationError.from_exception_data(
                    title="TestResponse",
                    line_errors=[
                        {
                            "type": "missing",
                            "loc": ("summary",),
                            "msg": "Field required",
                            "input": {"title": "Test"},
                        }
                    ],
                )
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with (
            patch("reflector.llm.Settings") as mock_settings,
            caplog.at_level("ERROR"),
        ):
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=astructured_predict_handler
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"

            error_logs = [r for r in caplog.records if r.levelname == "ERROR"]
            raw_response_logged = any("Raw response:" in r.message for r in error_logs)
            assert raw_response_logged, "Raw response should be logged on parse error"

    @pytest.mark.asyncio
    async def test_multiple_validation_errors_in_feedback(self, test_settings):
        """Test that validation errors are included in reflection feedback"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        call_count = {"count": 0}

        async def astructured_predict_handler(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                # Missing title and summary
                raise ValidationError.from_exception_data(
                    title="TestResponse",
                    line_errors=[
                        {
                            "type": "missing",
                            "loc": ("title",),
                            "msg": "Field required",
                            "input": {},
                        },
                        {
                            "type": "missing",
                            "loc": ("summary",),
                            "msg": "Field required",
                            "input": {},
                        },
                    ],
                )
            else:
                # Should have schema validation errors in reflection
                assert "reflection" in kwargs
                assert (
                    "Schema validation errors" in kwargs["reflection"]
                    or "error" in kwargs["reflection"].lower()
                )
                return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=astructured_predict_handler
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"
            assert call_count["count"] == 2

    @pytest.mark.asyncio
    async def test_success_on_first_attempt(self, test_settings):
        """Test that no retry happens when first attempt succeeds"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                return_value=TestResponse(
                    title="Test", summary="Summary", confidence=0.95
                )
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"
            assert result.summary == "Summary"
            assert result.confidence == 0.95
            assert mock_settings.llm.astructured_predict.call_count == 1


class TestNetworkErrorRetries:
    """Test that network errors are retried by the outer retry() wrapper"""

    @pytest.mark.asyncio
    async def test_network_error_retried_by_outer_wrapper(self, test_settings):
        """Test that network errors trigger the outer retry wrapper"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        call_count = {"count": 0}

        async def astructured_predict_handler(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                raise ConnectionError("Connection refused")
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=astructured_predict_handler
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"
            assert call_count["count"] == 2

    @pytest.mark.asyncio
    async def test_network_error_exhausts_retries(self, test_settings):
        """Test that persistent network errors exhaust retry attempts"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=ConnectionError("Connection refused")
            )

            with pytest.raises(RetryException, match="Retry attempts exceeded"):
                await llm.get_structured_response(
                    prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
                )

            # 3 retry attempts
            assert mock_settings.llm.astructured_predict.call_count == 3


class TestGetResponseRetries:
    """Test that get_response() uses the same retry() wrapper for transient errors."""

    @pytest.mark.asyncio
    async def test_get_response_retries_on_connection_error(self, test_settings):
        """Test that get_response retries on ConnectionError and returns on success."""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        mock_instance = MagicMock()
        mock_instance.aget_response = AsyncMock(
            side_effect=[
                ConnectionError("Connection refused"),
                "  Summary text  ",
            ]
        )

        with patch("reflector.llm.TreeSummarize", return_value=mock_instance):
            result = await llm.get_response("Prompt", ["text"])

        assert result == "Summary text"
        assert mock_instance.aget_response.call_count == 2

    @pytest.mark.asyncio
    async def test_get_response_exhausts_retries(self, test_settings):
        """Test that get_response raises RetryException after retry attempts exceeded."""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        mock_instance = MagicMock()
        mock_instance.aget_response = AsyncMock(
            side_effect=ConnectionError("Connection refused")
        )

        with patch("reflector.llm.TreeSummarize", return_value=mock_instance):
            with pytest.raises(RetryException, match="Retry attempts exceeded"):
                await llm.get_response("Prompt", ["text"])

        assert mock_instance.aget_response.call_count == 3

    @pytest.mark.asyncio
    async def test_get_response_returns_empty_string_without_retry(self, test_settings):
        """Empty or whitespace-only LLM response must return '' and not raise RetryException.

        retry() must return falsy results (e.g. '' from get_response) instead of
        treating them as 'no result' and retrying until RetryException.
        """
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        mock_instance = MagicMock()
        mock_instance.aget_response = AsyncMock(return_value="   \n  ")  # strip() -> ""

        with patch("reflector.llm.TreeSummarize", return_value=mock_instance):
            result = await llm.get_response("Prompt", ["text"])

        assert result == ""
        assert mock_instance.aget_response.call_count == 1


class TestTextsInclusion:
    """Test that texts parameter is included in the prompt sent to astructured_predict"""

    @pytest.mark.asyncio
    async def test_texts_included_in_prompt(self, test_settings):
        """Test that texts content is appended to the prompt for astructured_predict"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        captured_prompts = []

        async def capture_prompt(output_cls, prompt_tmpl, **kwargs):
            captured_prompts.append(kwargs.get("user_prompt", ""))
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=capture_prompt
            )

            await llm.get_structured_response(
                prompt="Identify all participants",
                texts=["Alice: Hello everyone", "Bob: Hi Alice"],
                output_cls=TestResponse,
            )

            assert len(captured_prompts) == 1
            prompt_sent = captured_prompts[0]
            assert "Identify all participants" in prompt_sent
            assert "Alice: Hello everyone" in prompt_sent
            assert "Bob: Hi Alice" in prompt_sent

    @pytest.mark.asyncio
    async def test_empty_texts_uses_prompt_only(self, test_settings):
        """Test that empty texts list sends only the prompt"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        captured_prompts = []

        async def capture_prompt(output_cls, prompt_tmpl, **kwargs):
            captured_prompts.append(kwargs.get("user_prompt", ""))
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=capture_prompt
            )

            await llm.get_structured_response(
                prompt="Identify all participants",
                texts=[],
                output_cls=TestResponse,
            )

            assert len(captured_prompts) == 1
            assert captured_prompts[0] == "Identify all participants"

    @pytest.mark.asyncio
    async def test_texts_included_in_reflection_retry(self, test_settings):
        """Test that texts are included in the prompt even during reflection retries"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        captured_prompts = []
        call_count = {"count": 0}

        async def capture_and_fail_first(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            captured_prompts.append(kwargs.get("user_prompt", ""))
            if call_count["count"] == 1:
                raise ValidationError.from_exception_data(
                    title="TestResponse",
                    line_errors=[
                        {
                            "type": "missing",
                            "loc": ("summary",),
                            "msg": "Field required",
                            "input": {},
                        }
                    ],
                )
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=capture_and_fail_first
            )

            await llm.get_structured_response(
                prompt="Summarize this",
                texts=["The meeting covered project updates"],
                output_cls=TestResponse,
            )

            # Both first attempt and reflection retry should include the texts
            assert len(captured_prompts) == 2
            for prompt_sent in captured_prompts:
                assert "Summarize this" in prompt_sent
                assert "The meeting covered project updates" in prompt_sent


class TestReflectionRetryBackoff:
    """Test the reflection retry timing behavior"""

    @pytest.mark.asyncio
    async def test_value_error_triggers_reflection(self, test_settings):
        """Test that ValueError (parse failure) also triggers reflection retry"""
        llm = LLM(settings=test_settings, temperature=0.4, max_tokens=100)

        call_count = {"count": 0}

        async def astructured_predict_handler(output_cls, prompt_tmpl, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                raise ValueError("Could not parse output")
            assert "reflection" in kwargs
            return TestResponse(title="Test", summary="Summary", confidence=0.95)

        with patch("reflector.llm.Settings") as mock_settings:
            mock_settings.llm.astructured_predict = AsyncMock(
                side_effect=astructured_predict_handler
            )

            result = await llm.get_structured_response(
                prompt="Test prompt", texts=["Test text"], output_cls=TestResponse
            )

            assert result.title == "Test"
            assert call_count["count"] == 2

    @pytest.mark.asyncio
    async def test_format_validation_error_method(self, test_settings):
        """Test _format_validation_error produces correct feedback"""
        # ValidationError
        try:
            TestResponse(title="x", summary="y", confidence=5.0)  # confidence > 1
        except ValidationError as e:
            result = LLM._format_validation_error(e)
            assert "Schema validation errors" in result
            assert "confidence" in result

        # ValueError
        result = LLM._format_validation_error(ValueError("bad input"))
        assert "Parse error:" in result
        assert "bad input" in result
