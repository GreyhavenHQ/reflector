"""
Suppress known dependency warnings. Import this before any reflector/hatchet_sdk
imports that pull in pydantic (e.g. llama_index) to hide UnsupportedFieldAttributeWarning
about validate_default.
"""

import warnings

warnings.filterwarnings(
    "ignore",
    message=".*validate_default.*",
    category=UserWarning,
)
