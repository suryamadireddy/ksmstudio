#!/usr/bin/env python3
"""
migrate_transcripts.py — One-time migration

Reads raw_transcript from existing triage JSONB and writes each turn
into the conversations + messages tables.

Run this BEFORE running the SQL migration that strips raw_transcript,
if you want to preserve existing transcript data.

Usage:
    python migrate_transcripts.py
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from db import get_client


def main() -> None:
    db = get_client()
    ideas = (
        db.table("ideas")
        .select("id, triage")
        .not_.is_("triage", "null")
        .execute()
    )

    migrated = 0
    skipped = 0

    for idea in ideas.data:
        triage = idea.get("triage") or {}
        transcript = triage.get("raw_transcript", [])
        if not transcript:
            skipped += 1
            continue

        conv_id = str(uuid.uuid4())
        triaged_at = triage.get("triaged_at", datetime.now(timezone.utc).isoformat())

        db.table("conversations").insert({
            "id": conv_id,
            "idea_id": idea["id"],
            "context": "triage",
            "created_at": triaged_at,
        }).execute()

        for entry in transcript:
            db.table("messages").insert({
                "id": str(uuid.uuid4()),
                "conversation_id": conv_id,
                "idea_id": idea["id"],
                "role": entry.get("role", "user"),
                "content": entry.get("content", ""),
                "created_at": triaged_at,
            }).execute()

        print(f"Migrated transcript for idea {idea['id']} ({len(transcript)} turns)")
        migrated += 1

    print(f"\nDone. Migrated: {migrated}, Skipped (no transcript): {skipped}")


if __name__ == "__main__":
    main()
