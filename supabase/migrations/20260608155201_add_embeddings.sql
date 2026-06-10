-- ═══════════════════════════════════════════════════════════════════════════════
-- Retrieval & Memory Layer — Layer 0 schema
-- Implements ATELIER_RETRIEVAL_SPEC.md §3 (schema) and §4 (single retrieval path).
--
-- Apply manually in the Supabase SQL editor. This is built ahead of need on
-- purpose: every later layer (hybrid search, reranking, contextual chunking, the
-- other corpora, freshness, measurement) adds BEHAVIOR on top of this shape and
-- migrates none of it (spec §3, §5).
--
-- NOTE: per spec §3 this table has NO row-level security defined. It is currently
-- unprotected — the backfill and the triage query path reach it via the service /
-- anon clients and the match_embeddings() function. Add RLS before any untrusted
-- (anon public) code path is allowed to query it. Not in Layer 0 scope.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── §3: enable pgvector ────────────────────────────────────────────────────────
create extension if not exists vector;

-- ── §3: the embeddings table (one table, many corpora) ──────────────────────────
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

-- ── §3: indexes ─────────────────────────────────────────────────────────────────
create index on embeddings using hnsw (embedding vector_cosine_ops);  -- used from Layer 0
create index on embeddings using gin  (fts);                          -- waits for Layer 1 (hybrid)
create index on embeddings (source_type);
create index on embeddings (source_id);

-- ── §4: the single retrieval path (pure vector match) ───────────────────────────
-- Both the Python pipeline and the web app call THIS function — one source of
-- truth for retrieval. Layer 1 adds a hybrid_match() alongside it; this one stays.
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
