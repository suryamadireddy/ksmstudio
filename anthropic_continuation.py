"""Helpers for Anthropic Messages pause_turn continuation."""

from __future__ import annotations

from typing import Any, Sequence


def serialize_assistant_content_for_continuation(
    content: Sequence[Any],
) -> list[dict[str, Any]]:
    """Serialize pause_turn assistant blocks for the next Messages request.

    Bare ``model_dump()`` includes null SDK fields (``caller``, ``citations``,
    ``page_age``) that the Messages API rejects with HTTP 400, aborting
    sharpening before any development output is saved. Strip nulls so
    thinking / text / server_tool_use / web_search_tool_result blocks
    round-trip cleanly.
    """
    serialized: list[dict[str, Any]] = []
    for block in content:
        if hasattr(block, "model_dump"):
            dumped = block.model_dump(exclude_none=True)
        elif isinstance(block, dict):
            dumped = {k: v for k, v in block.items() if v is not None}
        else:
            raise TypeError(f"Unsupported content block type: {type(block)!r}")
        if not isinstance(dumped, dict):
            raise TypeError(f"Content block did not serialize to a dict: {type(dumped)!r}")
        serialized.append(dumped)
    return serialized
