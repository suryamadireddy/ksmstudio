# Public Isolation — Tracked Follow-ups

Context: the public Gallery agent and public read paths were hardened to
deny-by-default (2026-06-09). The public agent now builds its context solely
from a public-safe projection (`web/lib/portfolio/public-projection.ts` →
`compose-system-prompt.ts`), the public read paths go through the `ideas_public`
view (`supabase/migrations/20260609000000_add_ideas_public_view.sql`), and the
leaky `/p/[slug]` page was removed.

These two items were deliberately left **out of scope** of that change and are
tracked here so they don't get lost.

---

## 1. `portfolio` JSONB may carry internal direction (creative_brief, snapshots)

**Status:** open · **Severity:** medium · **Surface:** public

The `ideas_public` view exposes the full `portfolio` JSONB (as the pre-existing
public surface always did). Within it, each `portfolio.versions[]` entry carries
fields that are *not* purely the published narrative:

- `versions[].creative_brief` — the brief used to generate a version; can hold
  internal product direction / instructions.
- `versions[].snapshots[]` — working-draft history (FIFO), i.e. intermediate
  editing state.

These ship to the client today via `/projects/[slug]` (which passes the active
version to `PortfolioRender` / `ChatPanel`) and are readable through the view.

**Type refs:** `web/lib/types.ts` — `PortfolioVersion` (`creative_brief`,
`snapshots`), `WorkingDraftSnapshot`.

**Proposed fix:** audit which `PortfolioVersion` sub-fields are genuinely public.
Either (a) project the active version down to a public-safe shape before it
reaches any public surface (the same deny-by-default discipline as
`toPublicIdea`), or (b) strip `creative_brief` / `snapshots` from what
`/projects/[slug]` and the view hand to the client. Option (a) preferred for
consistency.

---

## 2. Distiller pass 3 is fed raw internal text it doesn't need

**Status:** open · **Severity:** low (defense-in-depth) · **Surface:** generation

`chatbot_context` is generated, not copied — pass 3 runs under a content
contract (`distill.py:278-301`) that forbids triage scores / kill-assumption
language / research findings. Verified: no verbatim-copy path exists, so this is
**not** an active leak.

However, pass 3's input (`_build_idea_context`, `distill.py:500-566`) hands the
model the full internal payload verbatim: kill-assumption text (`:525-528`),
`triage_reasoning` (`:522`), effort/impact/confidence scores (`:518-519`),
disposition/category, and competitive landscape. The cleanliness of
`chatbot_context` therefore rests on prompt discipline, not on structure — a
model lapse could paraphrase internal material into the public character.

**Proposed fix:** narrow what `_build_idea_context` passes to pass 3 (the
content/character pass) so it only receives what it needs to write public voice
and presentation — stop feeding it raw kill-assumption text, scores, and
reasoning. This makes the public character clean by construction rather than by
instruction.

**Note:** the distiller was intentionally left untouched in the 2026-06-09
hardening because the fix condition there was "no verbatim-copy path," which was
met.
