#!/usr/bin/env python3
"""
migrate_transcripts.py — One-time migration

Reads raw_transcript from existing triage JSONB and writes each turn
into the conversations + messages tables.

Run this BEFORE running the SQL migration that strips raw_transcript,
if you want to preserve existing transcript data.

Requires the Supabase service-role key (SUPABASE_SERVICE_KEY). The anon
key is not sufficient: RLS only exposes published ideas to anon, and anon
cannot insert triage conversations. Using the anon client silently skips
unpublished transcripts, which are then permanently deleted by the strip
SQL.

Usage:
    python migrate_transcripts.py
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from db import get_service_client


class _QueryResult(Protocol):
    data: Any
    error: Any


def _require_ok(result: Any, action: str) -> Any:
    """Raise if a PostgREST/supabase response carries an error."""
    error = getattr(result, "error", None)
    if error:
        raise RuntimeError(f"{action} failed: {error}")
    return result


def migrate_transcripts(db: Any) -> tuple[int, int]:
    """
    Copy triage.raw_transcript into conversations + messages for every idea.

    Returns (migrated_count, skipped_count). Uses the provided client as-is;
    callers must pass a service-role client so RLS does not hide unpublished
    ideas or block triage conversation inserts.
    """
    ideas = _require_ok(
        db.table("ideas")
        .select("id, triage")
        .not_.is_("triage", "null")
        .execute(),
        "Selecting ideas with triage",
    )

    rows = ideas.data or []
    migrated = 0
    skipped = 0

    for idea in rows:
        triage = idea.get("triage") or {}
        transcript = triage.get("raw_transcript", [])
        if not transcript:
            skipped += 1
            continue

        if not isinstance(transcript, list):
            raise RuntimeError(
                f"Idea {idea['id']} has non-list raw_transcript "
                f"({type(transcript).__name__}); refusing to continue"
            )

        conv_id = str(uuid.uuid4())
        triaged_at = triage.get("triaged_at", datetime.now(timezone.utc).isoformat())

        _require_ok(
            db.table("conversations").insert({
                "id": conv_id,
                "idea_id": idea["id"],
                "context": "triage",
                "created_at": triaged_at,
            }).execute(),
            f"Inserting conversation for idea {idea['id']}",
        )

        for entry in transcript:
            if not isinstance(entry, dict):
                raise RuntimeError(
                    f"Idea {idea['id']} has a non-object transcript entry; "
                    "refusing to continue"
                )
            _require_ok(
                db.table("messages").insert({
                    "id": str(uuid.uuid4()),
                    "conversation_id": conv_id,
                    "idea_id": idea["id"],
                    "role": entry.get("role", "user"),
                    "content": entry.get("content", ""),
                    "created_at": triaged_at,
                }).execute(),
                f"Inserting message for idea {idea['id']}",
            )

        print(f"Migrated transcript for idea {idea['id']} ({len(transcript)} turns)")
        migrated += 1

    return migrated, skipped


def main() -> None:
    # Service role bypasses RLS. Required so unpublished ideas are visible and
    # triage-context conversation/message inserts are allowed.
    db = get_service_client()
    migrated, skipped = migrate_transcripts(db)
    print(f"\nDone. Migrated: {migrated}, Skipped (no transcript): {skipped}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print(
            "Migration aborted. Do NOT run the SQL that strips raw_transcript "
            "until this script completes successfully with the service-role key.",
            file=sys.stderr,
        )
        sys.exit(1)
