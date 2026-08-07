"""Pure helpers for retriage_pending / retriage_reasons mutations."""

from __future__ import annotations

from typing import Any, Protocol


MAX_RETRIAGE_CAS_ATTEMPTS = 3


class _IdeasTable(Protocol):
    def update(self, values: dict) -> Any: ...


class _SupabaseClient(Protocol):
    def table(self, name: str) -> Any: ...


def normalize_retriage_reasons(reasons: Any) -> list[dict]:
    """Return a shallow-copied list of reason dicts (empty if missing/invalid)."""
    if not isinstance(reasons, list):
        return []
    out: list[dict] = []
    for entry in reasons:
        if isinstance(entry, dict):
            out.append(dict(entry))
    return out


def append_retriage_reason(
    current: Any,
    reason: str,
    now: str,
    source: str = "conversation",
) -> list[dict]:
    """
    Append one retriage reason without mutating ``current``.

    Callers must persist with compare-and-swap on the previous
    ``retriage_reasons`` value so concurrent flag/dismiss/retriage
    writers cannot drop reasons or resurrect a cleared list.
    """
    reasons = normalize_retriage_reasons(current)
    reasons.append(
        {
            "reason": reason,
            "flagged_at": now,
            "source": source,
        }
    )
    return reasons


def apply_retriage_clear(
    current: Any,
    clear_before: str | None = None,
) -> tuple[list[dict], bool]:
    """
    Compute the post-clear ``retriage_reasons`` and ``retriage_pending``.

    When ``clear_before`` is set (ISO timestamp from retriage session start),
    keep reasons flagged strictly after that instant so a concurrent converse
    insight during a long retriage is not wiped by the save.
    When ``clear_before`` is None, clear everything (dismiss).
    """
    reasons = normalize_retriage_reasons(current)
    if clear_before is None:
        return [], False
    remaining = [
        entry
        for entry in reasons
        if str(entry.get("flagged_at") or "") > clear_before
    ]
    return remaining, len(remaining) > 0


def cas_write_retriage_flags(
    supabase: _SupabaseClient,
    idea_id: str,
    *,
    pending: bool,
    reasons: list[dict],
    expected: list[dict],
) -> bool:
    """
    Compare-and-swap ``retriage_pending`` / ``retriage_reasons``.

    Matches the previous reasons list (treating DB null like []). Returns
    True when at least one row was updated.
    """
    payload = {
        "retriage_pending": pending,
        "retriage_reasons": reasons,
    }
    table = supabase.table("ideas")
    if not expected:
        null_write = (
            table.update(payload)
            .eq("id", idea_id)
            .is_("retriage_reasons", "null")
            .execute()
        )
        if null_write.data:
            return True
        empty_write = (
            supabase.table("ideas")
            .update(payload)
            .eq("id", idea_id)
            .eq("retriage_reasons", [])
            .execute()
        )
        return bool(empty_write.data)

    write = (
        table.update(payload)
        .eq("id", idea_id)
        .eq("retriage_reasons", expected)
        .execute()
    )
    return bool(write.data)
