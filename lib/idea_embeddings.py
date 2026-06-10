"""
lib/idea_embeddings.py — structure-aware chunking + idempotent embedding for the
'idea' corpus (ATELIER_RETRIEVAL_SPEC.md §6).

Single source of truth shared by:
  - scripts/backfill_embeddings.py        (one-time / bulk rebuild)
  - the embed-on-write hooks at triage / sharpen / artifacts completion (§6.2)

Idempotency: re-embedding a field GROUP deletes that group's existing rows
(matched by `source_ref` prefix, so a shrinking list — e.g. fewer personas than
last run — does not orphan stale chunks) and re-inserts. Safe to call repeatedly.

Import-safe: this module pulls no heavy dependencies at import time (the OpenAI
client in lib.embed is imported lazily inside embed_and_store), so a pipeline
module can `import lib.idea_embeddings` even if `openai` is not installed — the
embed call simply degrades to a logged skip.
"""

from __future__ import annotations

import json
import sys
from typing import Iterable

import uuid as _uuid_mod

def _uuid_or_none(val):
    try:
        _uuid_mod.UUID(str(val))
        return str(val)
    except (ValueError, AttributeError):
        return None

# Chunk budget (spec §6: ~512 tokens, ~50 overlap, split only when long enough).
# Tokens approximated as ~4 chars/token.
MAX_CHARS = 512 * 4
OVERLAP_CHARS = 50 * 4

# ── Logical field groups (the §6 chunkable fields) ──────────────────────────────
GROUP_RAW_INPUT = "raw_input"
GROUP_PROBLEM_STATEMENT = "problem_statement"
GROUP_CORE_HYPOTHESIS = "core_hypothesis"
GROUP_PERSONAS = "personas"
GROUP_OPEN_QUESTIONS = "open_questions"
GROUP_KILL_ASSUMPTIONS = "kill_assumptions"
GROUP_TRIAGE_VERDICT = "triage_verdict"

ALL_GROUPS = [
    GROUP_RAW_INPUT,
    GROUP_PROBLEM_STATEMENT,
    GROUP_CORE_HYPOTHESIS,
    GROUP_PERSONAS,
    GROUP_OPEN_QUESTIONS,
    GROUP_KILL_ASSUMPTIONS,
    GROUP_TRIAGE_VERDICT,
]

# ── Which groups each pipeline stage writes (§6.2 embed-on-write) ───────────────
# A stage re-embeds only the fields it just wrote.
TRIAGE_GROUPS = [GROUP_RAW_INPUT, GROUP_KILL_ASSUMPTIONS, GROUP_TRIAGE_VERDICT]
RETRIAGE_GROUPS = [GROUP_KILL_ASSUMPTIONS, GROUP_TRIAGE_VERDICT]  # re-triage leaves raw_input untouched
SHARPEN_GROUPS = [
    GROUP_PROBLEM_STATEMENT,
    GROUP_CORE_HYPOTHESIS,
    GROUP_PERSONAS,
    GROUP_OPEN_QUESTIONS,
]
# §6 does not chunk PRD / MVP scope / next steps / builder brief, so the artifacts
# stage has no embeddable fields under the current corpus definition. The hook is
# still wired at artifacts completion for completeness; it is a 0-chunk no-op until
# §6's chunk set is deliberately extended.
ARTIFACTS_GROUPS: list[str] = []

# source_ref prefix for each group — used to BUILD refs and to SCOPE deletes.
_GROUP_REF = {
    GROUP_RAW_INPUT: "raw_input",
    GROUP_PROBLEM_STATEMENT: "problem_statement",
    GROUP_CORE_HYPOTHESIS: "core_hypothesis",
    GROUP_PERSONAS: "persona",
    GROUP_OPEN_QUESTIONS: "open_question",
    GROUP_KILL_ASSUMPTIONS: "kill_assumption",
    GROUP_TRIAGE_VERDICT: "triage_verdict",
}


def _split_long(text: str | None) -> list[str]:
    """Split only when a field exceeds the budget; otherwise return it whole."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= MAX_CHARS:
        return [text]
    parts: list[str] = []
    start = 0
    while start < len(text):
        end = start + MAX_CHARS
        parts.append(text[start:end])
        if end >= len(text):
            break
        start = end - OVERLAP_CHARS
    return parts


def _metadata(idea: dict) -> dict:
    return {
        "domain": idea.get("domain"),
        "state": idea.get("state"),
        "published": bool(idea.get("published", False)),
    }


def _build_group_chunks(idea: dict, group: str) -> list[dict]:
    """Return [{source_ref, chunk_index, chunk_text}] for one field group."""
    idea_id = idea["id"]
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    out: list[dict] = []

    def singleton(ref_base: str, text: str | None) -> None:
        parts = _split_long(text)
        for j, part in enumerate(parts):
            ref = f"ideas/{idea_id}/{ref_base}" + (f"/part/{j}" if len(parts) > 1 else "")
            out.append({"source_ref": ref, "chunk_index": j, "chunk_text": part})

    if group == GROUP_RAW_INPUT:
        singleton("raw_input", idea.get("raw_input"))

    elif group == GROUP_PROBLEM_STATEMENT:
        singleton("problem_statement", dev.get("problem_statement"))

    elif group == GROUP_CORE_HYPOTHESIS:
        singleton("core_hypothesis", dev.get("core_hypothesis"))

    elif group == GROUP_PERSONAS:
        personas = dev.get("personas") or []
        if isinstance(personas, str):
            try:
                personas = json.loads(personas)
            except Exception:
                personas = []
        if isinstance(personas, list):
            for i, p in enumerate(personas):
                if isinstance(p, dict):
                    txt = (
                        f"{p.get('label', '')}: {p.get('description', '')} "
                        f"Pain: {p.get('pain', '')} Gain: {p.get('gain', '')}"
                    )
                else:
                    txt = str(p)
                txt = txt.strip()
                if txt:
                    out.append(
                        {
                            "source_ref": f"ideas/{idea_id}/persona/{i}",
                            "chunk_index": i,
                            "chunk_text": txt,
                        }
                    )

    elif group == GROUP_OPEN_QUESTIONS:
        for i, q in enumerate(dev.get("open_questions") or []):
            txt = (q if isinstance(q, str) else str(q)).strip()
            if txt:
                out.append(
                    {
                        "source_ref": f"ideas/{idea_id}/open_question/{i}",
                        "chunk_index": i,
                        "chunk_text": txt,
                    }
                )

    elif group == GROUP_KILL_ASSUMPTIONS:
        for i, a in enumerate(triage.get("kill_assumptions") or []):
            if isinstance(a, dict):
                txt = f"{a.get('text', '')} [status: {a.get('status', 'untested')}]"
            else:
                txt = f"{a} [status: untested]"
            txt = txt.strip()
            if txt and txt != "[status: untested]":
                out.append(
                    {
                        "source_ref": f"ideas/{idea_id}/kill_assumption/{i}",
                        "chunk_index": i,
                        "chunk_text": txt,
                    }
                )

    elif group == GROUP_TRIAGE_VERDICT:
        if triage:
            verdict = (
                f"Title: {triage.get('title', '')}. "
                f"Disposition: {triage.get('disposition')} "
                f"(category {triage.get('category')}). "
                f"Scores: effort {triage.get('effort_score')}/5, "
                f"impact {triage.get('impact_score')}/5, "
                f"confidence {triage.get('confidence')}/5. "
                f"Who benefits: {triage.get('who_benefits', '')}. "
                f"Reasoning: {triage.get('triage_reasoning', '')}"
            )
            singleton("triage_verdict", verdict)

    return out


def build_idea_chunks(idea: dict, groups: Iterable[str] | None = None) -> list[dict]:
    """All chunks for the requested groups (default: every group)."""
    target = list(groups) if groups is not None else ALL_GROUPS
    chunks: list[dict] = []
    for g in target:
        chunks.extend(_build_group_chunks(idea, g))
    return chunks


def embed_and_store(db, idea: dict, groups: Iterable[str] | None = None) -> int:
    """
    Idempotently (re)embed an idea's chunks for the given field groups and write
    them to `embeddings`. `groups=None` rebuilds the whole idea (backfill).

    `db` must be a Supabase client with write access to `embeddings`
    (service-role for trusted pipelines). Returns the number of chunks written.
    """
    # Lazy import: keeps this module importable without `openai` installed.
    from lib.embed import EMBEDDING_MODEL, embed_texts, to_pgvector

    idea_id = idea["id"]
    target = list(groups) if groups is not None else ALL_GROUPS
    if not target:
        return 0  # nothing this stage embeds (e.g. artifacts under §6)

    # Idempotent delete, scoped to the groups being rewritten.
    if groups is None:
        db.table("embeddings").delete().like("source_ref", f"ideas/{idea_id}/%").execute()
    else:
        for g in target:
            prefix = f"ideas/{idea_id}/{_GROUP_REF[g]}"
            db.table("embeddings").delete().eq("source_type", "idea").like(
                "source_ref", f"{prefix}%"
            ).execute()

    chunks = build_idea_chunks(idea, target)
    if not chunks:
        return 0

    vectors = embed_texts([c["chunk_text"] for c in chunks])
    md = _metadata(idea)
    rows = [
        {
            "source_type": "idea",
            "source_id": _uuid_or_none(idea_id),
            "source_ref": c["source_ref"],
            "chunk_index": c["chunk_index"],
            "chunk_text": c["chunk_text"],
            "embedding": to_pgvector(vec),
            "model": EMBEDDING_MODEL,
            "metadata": md,
        }
        for c, vec in zip(chunks, vectors)
    ]
    db.table("embeddings").insert(rows).execute()
    return len(rows)


def embed_on_write(idea_id: str, groups: Iterable[str], label: str = "") -> int:
    """
    Embed-on-write hook (spec §6.2). Re-reads the just-written idea row and embeds
    only the field groups this stage wrote, so retrieval never goes stale between
    backfills.

    BEST-EFFORT BY DESIGN: never raises. A retrieval-layer failure (missing
    OPENAI_API_KEY, `openai` not installed, migration not yet applied, transient
    API error) must not break the pipeline write that triggered it — it logs a
    skip to stderr and returns 0.
    """
    tag = label or "idea"
    target = list(groups)
    if not target:
        return 0  # e.g. artifacts: no embeddable fields under §6
    try:
        from db import get_service_client

        db = get_service_client()
        row = (
            db.table("ideas")
            .select("id, raw_input, domain, state, published, triage, development")
            .eq("id", idea_id)
            .single()
            .execute()
        )
        if not row.data:
            return 0
        n = embed_and_store(db, row.data, target)
        if n:
            print(f"\033[90m  ↪ embedded {n} chunk(s) [{tag}]\033[0m", file=sys.stderr)
        return n
    except Exception as exc:
        print(
            f"\033[90m  (embed-on-write skipped [{tag}]: {exc})\033[0m",
            file=sys.stderr,
        )
        return 0
