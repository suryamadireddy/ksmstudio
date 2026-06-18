"""Helpers for safely updating ideas.development JSON blobs."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def merge_development(
    existing: Mapping[str, Any] | None,
    incoming: Mapping[str, Any],
) -> dict[str, Any]:
    """Overlay new development fields without dropping unrelated artifacts."""
    base = dict(existing) if isinstance(existing, Mapping) else {}
    return {**base, **incoming}
