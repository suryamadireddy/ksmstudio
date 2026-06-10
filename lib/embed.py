"""
lib/embed.py — Shared embedding utility (Python / pipeline side).

Implements the embedding code path from ATELIER_RETRIEVAL_SPEC.md §4 ("embedding
generation gets one home") and the Layer 0 model lock in §6
(text-embedding-3-small, 1536 dims).

CORRECTNESS RULE (spec §3, non-negotiable): the query is embedded with the SAME
model as the stored chunks — a different model is a different vector space and
silent garbage. EMBEDDING_MODEL below is the single source of truth on the Python
side; lib/embed.ts MUST declare the identical string. Changing the model is a
full re-embed of the table plus a bump of the `model` column, not a config tweak.

Requires:
  - OPENAI_API_KEY in the environment (loaded from .env by config.py / callers)
  - the `openai` package (added to requirements.txt)
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from openai import OpenAI

# ── Model lock — keep IN SYNC with lib/embed.ts ─────────────────────────────────
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to .env before embedding."
        )
    return OpenAI(api_key=api_key)


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a batch of strings. Returns one EMBEDDING_DIMENSIONS-length vector per
    input, in the same order as the input list.
    """
    if not texts:
        return []
    # The API rejects empty strings; substitute a single space so output indices
    # stay aligned 1:1 with the caller's input list.
    cleaned = [t if (t and t.strip()) else " " for t in texts]
    resp = _client().embeddings.create(model=EMBEDDING_MODEL, input=cleaned)
    items = sorted(resp.data, key=lambda d: d.index)  # defensive: guarantee order
    vectors = [item.embedding for item in items]
    for v in vectors:
        if len(v) != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                f"Embedding dimension mismatch: got {len(v)}, "
                f"expected {EMBEDDING_DIMENSIONS} for model {EMBEDDING_MODEL}"
            )
    return vectors


def embed_text(text: str) -> List[float]:
    """Embed a single string. Returns an EMBEDDING_DIMENSIONS-length vector."""
    return embed_texts([text])[0]


def to_pgvector(vector: List[float]) -> str:
    """
    Format a Python float list as a pgvector literal ('[v0,v1,...]') for insertion
    or RPC through PostgREST, which does not accept a raw JSON array for the
    vector type.
    """
    return "[" + ",".join(str(x) for x in vector) + "]"
