import logging
from contextvars import ContextVar
from typing import Type, TypeVar
from uuid import uuid4

from llama_index.core import Settings
from llama_index.core.prompts import PromptTemplate
from llama_index.core.response_synthesizers import TreeSummarize
from llama_index.llms.openai_like import OpenAILike
from pydantic import BaseModel, ValidationError

from reflector.utils.retry import retry

T = TypeVar("T", bound=BaseModel)

# Session ID for LiteLLM request grouping - set per processing run
llm_session_id: ContextVar[str | None] = ContextVar("llm_session_id", default=None)

logger = logging.getLogger(__name__)


class LLMParseError(Exception):
    """Raised when LLM output cannot be parsed after retries."""

    def __init__(self, output_cls: Type[BaseModel], error_msg: str, attempts: int):
        self.output_cls = output_cls
        self.error_msg = error_msg
        self.attempts = attempts
        super().__init__(
            f"Failed to parse {output_cls.__name__} after {attempts} attempts: {error_msg}"
        )


class LLM:
    def __init__(
        self, settings, temperature: float = 0.4, max_tokens: int | None = None
    ):
        self.settings_obj = settings
        self.model_name = settings.LLM_MODEL
        self.url = settings.LLM_URL
        self.api_key = settings.LLM_API_KEY
        self.context_window = settings.LLM_CONTEXT_WINDOW
        self.temperature = temperature
        self.max_tokens = max_tokens

        self._configure_llamaindex()

    def _configure_llamaindex(self):
        """Configure llamaindex Settings with OpenAILike LLM"""
        session_id = llm_session_id.get() or f"fallback-{uuid4().hex}"

        Settings.llm = OpenAILike(
            model=self.model_name,
            api_base=self.url,
            api_key=self.api_key,
            context_window=self.context_window,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            timeout=self.settings_obj.LLM_REQUEST_TIMEOUT,
            additional_kwargs={"extra_body": {"litellm_session_id": session_id}},
        )

    async def get_response(
        self, prompt: str, texts: list[str], tone_name: str | None = None
    ) -> str:
        """Get a text response using TreeSummarize for non-function-calling models"""
        summarizer = TreeSummarize(verbose=False)
        response = await summarizer.aget_response(prompt, texts, tone_name=tone_name)
        return str(response).strip()

    async def get_structured_response(
        self,
        prompt: str,
        texts: list[str],
        output_cls: Type[T],
        tone_name: str | None = None,
        timeout: int | None = None,
    ) -> T:
        """Get structured output from LLM using tool-call with reflection retry.

        Uses astructured_predict (function-calling / tool-call mode) for the
        first attempt.  On ValidationError or parse failure the wrong output
        and error are fed back as a reflection prompt and the call is retried
        up to LLM_PARSE_MAX_RETRIES times.

        The outer retry() wrapper handles transient network errors with
        exponential back-off.
        """
        max_retries = self.settings_obj.LLM_PARSE_MAX_RETRIES

        async def _call_with_reflection():
            # Build full prompt: instruction + source texts
            if texts:
                texts_block = "\n\n".join(texts)
                full_prompt = f"{prompt}\n\n{texts_block}"
            else:
                full_prompt = prompt

            prompt_tmpl = PromptTemplate("{user_prompt}")
            last_error: str | None = None

            for attempt in range(1, max_retries + 2):  # +2: first try + retries
                try:
                    if attempt == 1:
                        result = await Settings.llm.astructured_predict(
                            output_cls, prompt_tmpl, user_prompt=full_prompt
                        )
                    else:
                        reflection_tmpl = PromptTemplate(
                            "{user_prompt}\n\n{reflection}"
                        )
                        result = await Settings.llm.astructured_predict(
                            output_cls,
                            reflection_tmpl,
                            user_prompt=full_prompt,
                            reflection=reflection,
                        )

                    if attempt > 1:
                        logger.info(
                            f"LLM structured_predict succeeded on attempt "
                            f"{attempt}/{max_retries + 1} for {output_cls.__name__}"
                        )
                    return result

                except (ValidationError, ValueError) as e:
                    wrong_output = str(e)
                    if len(wrong_output) > 2000:
                        wrong_output = wrong_output[:2000] + "... [truncated]"

                    last_error = self._format_validation_error(e)
                    reflection = (
                        f"Your previous response could not be parsed.\n\n"
                        f"Error:\n{last_error}\n\n"
                        "Please try again and return valid data matching the schema."
                    )

                    logger.error(
                        f"LLM parse error (attempt {attempt}/{max_retries + 1}): "
                        f"{type(e).__name__}: {e}\n"
                        f"Raw response: {wrong_output[:500]}"
                    )

            raise LLMParseError(
                output_cls=output_cls,
                error_msg=last_error or "Max retries exceeded",
                attempts=max_retries + 1,
            )

        return await retry(_call_with_reflection)(
            retry_attempts=3,
            retry_backoff_interval=1.0,
            retry_backoff_max=30.0,
            retry_ignore_exc_types=(ConnectionError, TimeoutError, OSError),
        )

    @staticmethod
    def _format_validation_error(error: Exception) -> str:
        """Format a validation/parse error for LLM reflection feedback."""
        if isinstance(error, ValidationError):
            error_messages = []
            for err in error.errors():
                field = ".".join(str(loc) for loc in err["loc"])
                error_messages.append(f"- {err['msg']} in field '{field}'")
            return "Schema validation errors:\n" + "\n".join(error_messages)
        return f"Parse error: {str(error)}"
