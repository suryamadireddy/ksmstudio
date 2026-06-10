/**
 * lib/embed.ts — Shared embedding utility (web app / query side).
 *
 * Query-side parity for the embedding path in ATELIER_RETRIEVAL_SPEC.md §4,
 * mirroring lib/embed.py. Same model, same dimensions.
 *
 * CORRECTNESS RULE (spec §3, non-negotiable): query and stored chunks must use
 * the SAME model. EMBEDDING_MODEL here MUST equal the constant in lib/embed.py.
 *
 * LAYER 0 STATUS: this module ships as correct parity code with NO call site
 * yet. Layer 0 wires retrieval only into the Python triage path (spec §6); the
 * web triage route still injects recency-ordered prior triages. Wire this in
 * when the web app needs query-side embeddings (e.g. when the web triage route
 * or a studio search adopts semantic retrieval).
 *
 * Placement note: this file lives in the repo-root `lib/` to sit beside
 * lib/embed.py as the shared retrieval home for the two-codebase repo. To import
 * it from the Next.js app (web/), it will need to be moved under web/lib/ or
 * reached via an added tsconfig path alias — Next cannot import from outside its
 * project root by default.
 *
 * Requires:
 *   - OPENAI_API_KEY in the environment
 *   - the `openai` npm package (install with: npm install openai)
 */

import OpenAI from "openai";

// ── Model lock — keep IN SYNC with lib/embed.py ─────────────────────────────────
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to the environment before embedding.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Embed a batch of strings. Returns one EMBEDDING_DIMENSIONS-length vector per
 * input, in the same order as the input array.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  // The API rejects empty strings; substitute a single space to keep indices aligned.
  const cleaned = texts.map((t) => (t && t.trim() ? t : " "));
  const resp = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
  });
  const sorted = [...resp.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => {
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: got ${item.embedding.length}, ` +
          `expected ${EMBEDDING_DIMENSIONS} for model ${EMBEDDING_MODEL}`,
      );
    }
    return item.embedding;
  });
}

/** Embed a single string. Returns an EMBEDDING_DIMENSIONS-length vector. */
export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

/**
 * Format a number[] as a pgvector literal ('[v0,v1,...]') for RPC through
 * PostgREST, which does not accept a raw JSON array for the vector type.
 */
export function toPgVector(vector: number[]): string {
  return "[" + vector.join(",") + "]";
}
