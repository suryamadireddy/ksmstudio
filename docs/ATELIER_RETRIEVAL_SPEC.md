# The Retrieval & Memory Layer — Build Spec

*The robust version of what the resume calls "RAG." This is not a search box bolted onto the studio; it is the memory layer the rest of the architecture sits on. Written schema-first and Cursor-ready: the schema is designed for the full version now, and the build order ships it a layer at a time, so you grow by adding behavior rather than migrating structure. Layer 0 is detailed enough to build this weekend and is a real foundation, not a throwaway.*

*Grounds on the current system as the gap audit found it: Supabase Postgres, an `ideas` table of query-columns plus JSONB content, a Python CLI pipeline and a Next.js web app sharing one database, and today no embeddings of any kind ("research" is the web-search tool plus stuffing rows into prompts). This spec adds the missing retrieval layer and, in doing so, gives the duplicated-prompt problem a single source of truth for retrieval.*

---

## 1. What it is

A retrieval and memory layer over everything the studio accumulates. At its base it answers one question well — "what do I already have that is relevant to this?" — and it answers it across several distinct bodies of knowledge, with retrieval quality good enough to trust, freshness so it is never stale, and one code path both runtimes call. At its top it stops being "retrieval" and becomes the substrate the spine, the connections, the manifester, and the idea-agents all draw on.

The decisions are locked here so the sub-chats that build each layer do not re-litigate them.

---

## 2. The corpora (what gets retrieved over)

One table, many corpora, distinguished by `source_type` and filtered by metadata:

- **idea** — your idea history: `raw_input`, problem statements, hypotheses, personas, kill-assumptions, triage verdicts. *The Layer 0 corpus.* Answers "have I thought about this, what did I decide, what did I get wrong."
- **taste** — your design-philosophy writings, the taste spine, and your logged agreements/disagreements. The spine's retrieval backend; grounds judgments of both substance and form.
- **research** — the findings your sharpen stage produces, so web work compounds instead of being re-fetched.
- **reference** — your reading and precedents (Zumthor, Pallasmaa, Frampton, Gehl, and the rest). Lets real outside thinking in rather than mirroring you; this is the retrieval answer to the confident-alien problem.
- **conversation** — journal and chat history, the running log.

Start with **idea**. The data already exists, the value is immediate and demonstrable, and your triage already has a retrieval hook to upgrade.

---

## 3. The schema (designed for the full version, used incrementally)

This is the one thing built ahead of need. Every later layer adds behavior on top of this shape; none of them migrate it.

```sql
create extension if not exists vector;

create table embeddings (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null,                       -- 'idea' | 'taste' | 'research' | 'reference' | 'conversation'
  source_id     uuid,                                -- originating row (ideas.id, etc.); null for external refs
  source_ref    text,                                -- human-readable origin, e.g. 'ideas/<id>/triage'
  chunk_index   int  not null default 0,
  chunk_text    text not null,                       -- the retrievable unit
  context_header text,                               -- contextual-retrieval prefix (Layer 1); stored for provenance
  embedding     vector(1536),                        -- model-locked dimensions; Layer 0 uses this
  fts           tsvector generated always as (to_tsvector('english', chunk_text)) stored,  -- keyword index, ready for hybrid (Layer 1)
  model         text not null default 'text-embedding-3-small',
  metadata      jsonb not null default '{}'::jsonb,  -- domain, state, date, tags, version_id — for filtering
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index on embeddings using hnsw (embedding vector_cosine_ops);  -- used from Layer 0
create index on embeddings using gin  (fts);                          -- waits for Layer 1 (hybrid)
create index on embeddings (source_type);
create index on embeddings (source_id);
```

Why this shape: `source_type` + `metadata` make it multi-corpus and filterable from day one. The generated `fts` column means hybrid search is a behavior change later, not a schema migration. `context_header` reserves room for contextual chunking. `model` records provenance so a future model switch is a known re-embed, not a mystery. HNSW + cosine is the right default at your scale and stays fast well past it.

**One correctness rule, non-negotiable:** the query is embedded with the *same model* as the stored chunks. Different model means a different vector space and silent garbage. If you change models, re-embed everything and bump `model`.

---

## 4. The single retrieval path (one source of truth)

Both the Python pipeline and the web app call the **same** Postgres function. This is also the fix for the prompt-duplication debt the audit flagged: retrieval logic lives in one place from the start.

```sql
-- Layer 0: pure vector match
create or replace function match_embeddings (
  query_embedding vector(1536),
  match_count int default 8,
  filter_source_types text[] default null,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid, source_type text, source_id uuid, source_ref text,
  chunk_text text, metadata jsonb, similarity float
)
language sql stable as $$
  select e.id, e.source_type, e.source_id, e.source_ref, e.chunk_text, e.metadata,
         1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  where (filter_source_types is null or e.source_type = any(filter_source_types))
    and e.metadata @> filter
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
```

Embedding generation also gets one home. Cleanest is a Supabase Edge Function `embed(text) -> vector` that both runtimes call, so there is exactly one embedding code path. For Layer 0 speed it is acceptable to start with one shared Python util plus the same call on the query side in TS, then consolidate to the Edge Function as the Layer 2 freshness work lands.

---

## 5. Build order (each layer ships; Layer 0 is the foundation)

- **Layer 0 — vector retrieval over idea history, wired into one stage.** §6. Resume-true and demonstrable.
- **Layer 1 — retrieval quality.** Hybrid search (fuse vector + `fts` via reciprocal rank fusion in a `hybrid_match` function), a reranker model over the fused candidates (the single biggest quality jump), and contextual chunking (prepend a one-line parent summary to each chunk before embedding; store it in `context_header`). Pure behavior; schema untouched.
- **Layer 2 — the other corpora + freshness.** Add taste, research, reference ingestion. Move embedding to embed-on-write (triggers or Supabase automatic embeddings via the Edge Function) so nothing goes stale.
- **Layer 3 — measurement.** A small eval set of `{query, expected_source_ids[]}` pairs and a script reporting recall@k and MRR, run before and after changes. Surface what was retrieved in the trace (observability on demand). This is the layer that makes the interview answer senior: a number, and the lift the reranker bought.
- **Layer 4 — studio integration, where it stops being RAG.** Wire retrieval into the spine (substance + form grounding), the connections substrate (cross-idea similarity surfaced to the Studio-Mind), the manifester (pull real precedents and taste when manifesting), and idea-agent memory (each idea retrieves its own and related history).

Add a layer when the studio needs it, not before. The schema is the only thing worth building ahead of need; building every layer up front before any is used is the cathedral trap.

---

## 6. Layer 0 in detail (the weekend)

**Model.** `text-embedding-3-small` (1536 dims). Simplest, you already have OpenAI access, widely understood, cheap. Upgrade path if retrieval quality disappoints: `text-embedding-3-large` (supports shortened dimensions, so you can keep the column size) or a Claude-aligned Voyage model. Commit to one now; switching later is a re-embed, not a redesign.

**Chunking — structure-aware, not blind splitting.** An idea is already structured, so chunk by meaningful field rather than by character count. From each `ideas` row, emit chunks for: `raw_input`; `development.problem_statement`; `development.core_hypothesis`; each persona; each open question; each kill-assumption (text + status); and the triage verdict with its reasoning. Each chunk: `source_type='idea'`, `source_id=ideas.id`, `source_ref` like `ideas/<id>/kill_assumption/2`, `metadata` carrying `{domain, state, published}`. Target ~512 tokens with ~50 overlap only where a field is long enough to split.

**Ingestion.** (1) A one-time backfill script that walks existing `ideas` rows, chunks them as above, embeds, and inserts. (2) A hook at the end of triage/sharpen/artifacts so a written or updated idea (re)embeds its affected chunks. Idempotent: delete an idea's chunks for the affected fields, re-insert.

**Retrieval, query side.** Given new text, embed it with the same model, call `match_embeddings(query_embedding, 8, ARRAY['idea'])`, take the hits.

**Wire it into triage.** Today `fetch_prior_triages` pulls *recent* triages for adaptive difficulty. Replace that with semantic retrieval: embed the new `raw_input`, match the top-k most *similar* past ideas, and inject their verdicts and kill-assumptions into the triage system prompt. The evaluator is now informed by genuinely related prior judgments, not just whatever was newest. This is the smallest change that turns retrieval into visible behavior.

**Acceptance criteria.**
1. `vector` enabled; `embeddings` table and indexes created exactly on the §3 schema.
2. Backfill embeds every existing idea; a new idea embeds on write.
3. `match_embeddings` returns sensibly related ideas for a plain-language query.
4. Query and stored embeddings use the same model (assert it).
5. Triage visibly injects retrieved similar-idea context; you can see it in the prompt or trace.
6. Demonstrable: typing a fresh idea surfaces genuinely related past ones, by meaning, not keyword.

---

## 7. Scale honesty

Robust here means retrieval *quality*, multiple corpora, measurement, and studio integration. It does not mean enterprise vector infrastructure. At a few hundred ideas you will never need a separate vector database, sharding, or IVFFlat tuning; HNSW on Supabase answers in single-digit milliseconds far past your size. Chasing scale you do not have is the wrong kind of robust. Spend the effort on hybrid + rerank + contextual chunking (Layer 1) and on integration (Layer 4); that is where the quality and the studio value actually live.

---

## 8. Where it sits — studio and resume

In the studio, this is the backbone: the spine retrieves to judge, the Studio-Mind retrieves to connect, the manifester retrieves to ground, each idea-agent retrieves to remember. It is the literal mechanism behind "connections" (where two ideas meet is a similarity query) and the grounding behind the taste spine.

For the search, Layer 0 makes the line true and gives you the honest story; Layer 3 makes it a senior story. The defensible version of the claim is exactly what this builds toward: retrieval over your own corpus on pgvector, hybrid search with a reranker, contextual chunking, measured by recall, feeding a real system. Built and explainable, not elaborate and vague.
