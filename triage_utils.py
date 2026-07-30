"""Pure helpers for triage JSONB mutations from converse insight updates."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


VALID_ASSUMPTION_STATUSES = frozenset(
    {"validated", "invalidated", "weakened", "strengthened"}
)


def triage_version_token(
    triage_version: int | None,
    triage: dict | None,
) -> int:
    """Resolve the optimistic-concurrency token for a triage write."""
    if isinstance(triage_version, int):
        return triage_version
    if isinstance(triage, dict):
        blob_version = triage.get("triage_version")
        if isinstance(blob_version, int):
            return blob_version
    return 1


def apply_kill_assumption_status(
    current: dict | None,
    assumption_text: str,
    status: str,
    now: str,
) -> tuple[bool, dict]:
    """
    Return (updated, triage) after applying one kill-assumption status change.

    Does not mutate ``current``. Callers must persist with compare-and-swap on
    ``triage_version`` so a concurrent retriage is not overwritten by a stale
    converse snapshot.
    """
    triage: dict[str, Any] = deepcopy(current) if current else {}
    assumptions = list(triage.get("kill_assumptions") or [])
    needle = assumption_text.lower()

    for i, entry in enumerate(assumptions):
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "")
        hay = text.lower()
        if needle not in hay and hay not in needle:
            continue
        updated_entry = dict(entry)
        updated_entry["status"] = status
        updated_entry["status_updated_at"] = now
        updated_entry["status_source"] = "conversation"
        assumptions[i] = updated_entry
        triage["kill_assumptions"] = assumptions
        return True, triage

    triage["kill_assumptions"] = assumptions
    return False, triage
