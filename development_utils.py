"""Pure helpers for merging keys into ideas.development JSONB."""

from __future__ import annotations


def merge_development_key(current_dev: dict | None, dev_key: str, value: dict) -> dict:
    """Merge one key into a development blob without mutating the input."""
    return {**(current_dev or {}), dev_key: value}
