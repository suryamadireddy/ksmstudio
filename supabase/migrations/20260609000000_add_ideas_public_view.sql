-- =============================================================================
-- ideas_public — deny-by-default public projection of published ideas
-- =============================================================================
--
-- Why: the `anon` Supabase key is public. Even though application code no longer
-- selects internal columns, anyone holding the anon key could query the `ideas`
-- table directly and read `triage`, `development`, `outcomes`, and `raw_input`.
-- This migration moves the public read path to a view that exposes ONLY
-- public-safe columns, and revokes the anon role's direct read on `ideas`.
--
-- Deny-by-default: the view's column list is the allowlist. Internal columns are
-- excluded by omission — a future internal column on `ideas` cannot leak unless
-- it is explicitly added to this view.
--
-- Apply order:
--   Part 1 (view + grants) is safe to run any time — it is additive.
--   Part 2 (REVOKE) is the enforced boundary and the irreversible-feeling step;
--           run it only after the public callers below read `ideas_public`:
--             - web/app/api/projects/[slug]/chat/route.ts
--             - web/app/(public)/projects/[slug]/page.tsx
--             - web/lib/get-featured-public-projects.ts
-- =============================================================================

-- ── Part 1: the view ─────────────────────────────────────────────────────────

create or replace view public.ideas_public as
  select
    id,
    domain,
    state,
    created_at,
    portfolio
  from public.ideas
  where published = true;

-- IMPORTANT: this view intentionally runs with its OWNER's privileges, not the
-- caller's. Do NOT set `security_invoker = true` — if you did, the anon caller
-- would need direct SELECT on `ideas`, which Part 2 revokes, and the view would
-- break. Owner-rights + the baked `where published = true` is what lets anon
-- read only published rows without touching the base table directly.

grant select on public.ideas_public to anon, authenticated;

-- ── Part 2: the enforced boundary (run after callers are repointed) ──────────
--
-- Removes the anon role's ability to read the base table at all. The
-- authenticated role (the studio operator) and service_role are unaffected and
-- keep full access to the internal columns.

revoke select on public.ideas from anon;

-- After this revoke, the existing "Public read published ideas" RLS policy on
-- `ideas` (for anon) is dead code — anon has no table-level SELECT privilege for
-- it to filter. It is harmless to leave in place; drop it if you want the policy
-- set to reflect reality:
--   drop policy if exists "Public read published ideas" on public.ideas;
