"""Normalize ideas.development.personas into a list of persona dicts.

Sharpening may persist personas as a raw string when JSON parsing fails, or as a
single object when the model omits the outer array. Downstream code that calls
``.get`` / iterates as a list must tolerate those shapes.
"""

from __future__ import annotations

import json
from typing import Any


def normalize_personas(raw: Any) -> list[dict]:
    """Return only dict personas from a stored development.personas value."""
    value = raw
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return []

    if isinstance(value, dict):
        return [value]

    if not isinstance(value, list):
        return []

    return [p for p in value if isinstance(p, dict)]
