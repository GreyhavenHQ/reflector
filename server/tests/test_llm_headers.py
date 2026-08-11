"""Tests for LLM attribution headers (User-Agent and x-llmproxy-tags)"""

import pytest

from reflector.llm import LLM, build_llm_headers


class TestBuildLLMHeaders:
    """Test the header builder in isolation"""

    def test_headers_exact_values(self):
        headers = build_llm_headers("summary", "0.45.0")

        assert headers == {
            "User-Agent": "reflector/0.45.0",
            "x-llmproxy-tags": "app:reflector,context:summary",
        }

    @pytest.mark.parametrize("context", ["topic", "title", "summary"])
    def test_context_appears_in_tags(self, context):
        headers = build_llm_headers(context, "dev")

        assert headers["x-llmproxy-tags"] == f"app:reflector,context:{context}"
        assert headers["User-Agent"] == "reflector/dev"


class TestLLMInstanceHeaders:
    """Test that constructed LLM instances carry the headers"""

    def test_instance_client_has_headers(self, test_settings):
        llm = LLM(settings=test_settings, context="title")

        assert llm._llm.default_headers == {
            "User-Agent": "reflector/dev",
            "x-llmproxy-tags": "app:reflector,context:title",
        }

    def test_version_flows_from_settings(self, test_settings):
        test_settings.REFLECTOR_VERSION = "1.2.3"

        llm = LLM(settings=test_settings, context="topic")

        assert llm._llm.default_headers["User-Agent"] == "reflector/1.2.3"

    def test_context_is_required(self, test_settings):
        with pytest.raises(TypeError):
            LLM(settings=test_settings)

    def test_headers_reach_the_http_client(self, test_settings):
        """default_headers must be applied to the underlying OpenAI SDK client,
        not just stored on the llama-index wrapper."""
        llm = LLM(settings=test_settings, context="summary")

        client_headers = llm._llm._get_client().default_headers

        assert client_headers["User-Agent"] == "reflector/dev"
        assert client_headers["x-llmproxy-tags"] == "app:reflector,context:summary"

    def test_instances_do_not_leak_context_to_each_other(self, test_settings):
        """Two concurrent LLM instances must keep their own headers."""
        title_llm = LLM(settings=test_settings, context="title")
        summary_llm = LLM(settings=test_settings, context="summary")

        assert (
            title_llm._llm.default_headers["x-llmproxy-tags"]
            == "app:reflector,context:title"
        )
        assert (
            summary_llm._llm.default_headers["x-llmproxy-tags"]
            == "app:reflector,context:summary"
        )
