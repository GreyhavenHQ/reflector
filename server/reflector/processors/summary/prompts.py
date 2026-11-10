"""
LLM prompts for summary generation.

Extracted to a separate module to avoid circular imports when importing
from summary_builder.py (which imports LLM/settings at module level).
"""

from textwrap import dedent

# Mirrors www/app/supportedLanguages.ts (code -> display name)
LANGUAGE_NAMES = {
    "af": "Afrikaans",
    "am": "Amharic",
    "ar": "Modern Standard Arabic",
    "ary": "Moroccan Arabic",
    "arz": "Egyptian Arabic",
    "as": "Assamese",
    "az": "North Azerbaijani",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "cs": "Czech",
    "ku": "Central Kurdish",
    "cmn": "Mandarin Chinese",
    "cy": "Welsh",
    "da": "Danish",
    "de": "German",
    "el": "Greek",
    "en": "English",
    "et": "Estonian",
    "eu": "Basque",
    "fi": "Finnish",
    "fr": "French",
    "gaz": "West Central Oromo",
    "ga": "Irish",
    "gl": "Galician",
    "gu": "Gujarati",
    "he": "Hebrew",
    "hi": "Hindi",
    "hr": "Croatian",
    "hu": "Hungarian",
    "hy": "Armenian",
    "ig": "Igbo",
    "id": "Indonesian",
    "is": "Icelandic",
    "it": "Italian",
    "jv": "Javanese",
    "ja": "Japanese",
    "kn": "Kannada",
    "ka": "Georgian",
    "kk": "Kazakh",
    "khk": "Halh Mongolian",
    "km": "Khmer",
    "ky": "Kyrgyz",
    "ko": "Korean",
    "lo": "Lao",
    "lt": "Lithuanian",
    "lg": "Ganda",
    "luo": "Luo",
    "lv": "Standard Latvian",
    "mai": "Maithili",
    "ml": "Malayalam",
    "mr": "Marathi",
    "mk": "Macedonian",
    "mt": "Maltese",
    "mni": "Meitei",
    "my": "Burmese",
    "nl": "Dutch",
    "nn": "Norwegian Nynorsk",
    "nb": "Norwegian Bokmål",
    "ne": "Nepali",
    "ny": "Nyanja",
    "or": "Odia",
    "pa": "Punjabi",
    "pbt": "Southern Pashto",
    "pes": "Western Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "ro": "Romanian",
    "ru": "Russian",
    "sk": "Slovak",
    "sl": "Slovenian",
    "sn": "Shona",
    "sd": "Sindhi",
    "so": "Somali",
    "es": "Spanish",
    "sr": "Serbian",
    "sv": "Swedish",
    "sw": "Swahili",
    "ta": "Tamil",
    "te": "Telugu",
    "tg": "Tajik",
    "tl": "Tagalog",
    "th": "Thai",
    "tr": "Turkish",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Northern Uzbek",
    "vi": "Vietnamese",
    "yo": "Yoruba",
    "yue": "Cantonese",
    "ms": "Standard Malay",
    "zu": "Zulu",
}


def resolve_summary_language(
    source_language: str | None,
    target_language: str | None,
    translated: bool = False,
) -> str | None:
    """
    Determine the language summaries should be generated in.

    When the transcript was actually translated (`translated` is True), the
    transcript is presented in the target language, so summaries should be too
    (target wins, then source as fallback).

    When no translation happened, the transcript text is in the spoken
    language, which the stored metadata may not reflect (frontend defaults and
    the "No translation" fallback both produce "en"). Returns None in that
    case, meaning: instruct the LLM to respond in the language of the text.
    """
    if translated:
        for language in (target_language, source_language):
            if language and language.strip():
                return language.strip()
    return None


def build_language_instruction(language: str | None) -> str:
    """
    Build a prompt instruction making the LLM respond in the given language.

    When no language is given, the LLM is instructed to respond in the same
    language as the input text. Unknown language codes are passed through
    as-is (LLMs understand ISO 639-1 codes).
    """
    if language and language.strip():
        code = language.strip()
        name = LANGUAGE_NAMES.get(code.lower(), code)
        return f"\n\nLANGUAGE: Write your entire response in {name}."
    return (
        "\n\nLANGUAGE: Write your entire response in the same language as "
        "the text you are summarizing."
    )


def build_participant_instructions(participant_names: list[str]) -> str:
    """Build participant context instructions for LLM prompts."""
    if not participant_names:
        return ""

    participants_list = ", ".join(participant_names)
    return dedent(
        f"""
        # IMPORTANT: Participant Names
        The following participants are identified in this conversation: {participants_list}

        You MUST use these specific participant names when referring to people in your response.
        Do NOT use generic terms like "a participant", "someone", "attendee", "Speaker 1", "Speaker 2", etc.
        Always refer to people by their actual names (e.g., "John suggested..." not "A participant suggested...").
        """
    ).strip()


DETAILED_SUBJECT_PROMPT_TEMPLATE = dedent(
    """
    Get me information about the topic "{subject}"

    # RESPONSE GUIDELINES
    Follow this structured approach to create the topic summary:
    - Highlight important arguments, insights, or data presented.
    - Outline decisions made.
    - Indicate any decisions reached, including any rationale or key factors
      that influenced these decisions.
    - Detail action items and responsibilities.
    - For each decision or unresolved issue, list specific action items agreed
      upon, along with assigned individuals or teams responsible for each task.
    - Specify deadlines or timelines if mentioned. For each action item,
      include any deadlines or timeframes discussed for completion or follow-up.
    - Mention unresolved issues or topics needing further discussion, aiding in
      planning future meetings or follow-up actions.
    - Be specific and cite participant names when attributing statements or actions.
    - Do not include topics unrelated to {subject}.

    # OUTPUT
    Your summary should be clear, concise, and structured, covering all major
    points, decisions, and action items from the meeting. It should be easy to
    understand for someone not present, providing a comprehensive understanding
    of what transpired and what needs to be done next. The summary should not
    exceed one page to ensure brevity and focus.
    """
).strip()

PARAGRAPH_SUMMARY_PROMPT = dedent(
    """
    Summarize the mentioned topic in 1 paragraph.
    It will be integrated into the final summary, so just for this topic.
    Preserve key decisions and action items. Do not introduce new information.
    """
).strip()

RECAP_PROMPT = dedent(
    """
    Provide a high-level quick recap of the following meeting, fitting in one paragraph.
    Do not include decisions, action items or unresolved issue, just highlight the high moments.
    Just dive into the meeting, be concise and do not include unnecessary details.
    As we already know it is a meeting, do not start with 'During the meeting' or equivalent.
    """
).strip()


def build_summary_markdown(recap: str, summaries: list[dict[str, str]]) -> str:
    """Build markdown summary from recap and subject summaries."""
    lines: list[str] = []
    if recap:
        lines.append("# Quick recap")
        lines.append("")
        lines.append(recap)
        lines.append("")

    if summaries:
        lines.append("# Summary")
        lines.append("")
        for summary in summaries:
            lines.append(f"**{summary['subject']}**")
            lines.append(summary["summary"])
            lines.append("")

    return "\n".join(lines)
