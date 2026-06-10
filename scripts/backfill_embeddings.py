#!/usr/bin/env python3
"""
scripts/backfill_embeddings.py — one-time embedding backfill (Layer 0).

Implements ATELIER_RETRIEVAL_SPEC.md §6 ingestion point (1): walk existing
`ideas` rows, chunk them structure-aware, embed, and insert into `embeddings`.

The chunking and idempotent store logic lives in lib/idea_embeddings.py — the
same module the embed-on-write hooks (§6.2) call — so backfill and live writes
stay in lockstep. This script is just the bulk driver.

Run from the repo root (uses the service-role client to bypass RLS for inserts):
    python scripts/backfill_embeddings.py
    python scripts/backfill_embeddings.py --idea <uuid>   # single idea
    python scripts/backfill_embeddings.py --dry-run        # chunk + count, no embed/write

Idempotent: per idea, all existing 'idea' chunks are deleted and re-inserted
(embed_and_store(..., groups=None)).
"""

from __future__ import annotations

import argparse
import os
import sys

# Make the repo root importable when run as `python scripts/backfill_embeddings.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from db import get_service_client  # noqa: E402
from lib.embed import EMBEDDING_MODEL  # noqa: E402
from lib.idea_embeddings import build_idea_chunks, embed_and_store  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill embeddings over ideas.")
    parser.add_argument("--idea", default=None, help="Backfill a single idea by UUID")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chunk and count only — do not embed or write",
    )
    args = parser.parse_args()

    db = get_service_client()

    query = db.table("ideas").select(
        "id, raw_input, domain, state, published, triage, development"
    )
    if args.idea:
        query = query.eq("id", args.idea)
    ideas = query.execute().data or []

    print(f"\n{'═' * 60}")
    print(f"  EMBEDDING BACKFILL  ({EMBEDDING_MODEL})")
    print(f"  Ideas: {len(ideas)}{'  [dry-run]' if args.dry_run else ''}")
    print(f"{'═' * 60}")

    total = 0
    for idea in ideas:
        if args.dry_run:
            n = len(build_idea_chunks(idea))
            print(f"  {idea['id']}: {n} chunks (dry-run, not written)")
        else:
            n = embed_and_store(db, idea, groups=None)  # full idempotent rebuild
            print(f"  {idea['id']}: {n} chunks embedded")
        total += n

    print(f"{'─' * 60}")
    print(f"  Done. {total} chunks across {len(ideas)} idea(s).")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    main()
