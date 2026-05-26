# Kiln — Current-State Audit Report

_Produced by static code inspection of `/Users/surya/Desktop/KSM Studio` as of 2026-05-25._

---

## 1. Overview

### Tech stack

**Backend pipeline** — Python 3.x scripts that run locally or are invoked by the web layer.

| File | Role |
|---|---|
| `triage.py` | Phase 1: Socratic idea interview + structured write to Supabase |
| `sharpen.py` | Phase 2: Web-search-grounded research & definitional outputs |
| `artifacts.py` | Phase 3: Four-stage artifact chain (PRD → MVP scope → Next steps → Builder brief) |
| `converse.py` | Studio conversational interface (internal & public modes) |
| `distill.py` | Portfolio distillation pipeline (three-pass: character → presentation → content) |
| `migrate_transcripts.py` | One-time migration utility |
| `config.py` | Model + env-var configuration |
| `db.py` | Supabase client factory (anon and service-role) |

**Web frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase SSR, shadcn/ui, framer-motion. Lives entirely in `web/`.

| Layer | Details |
|---|---|
| Framework | Next.js 16.2.3, React 19.2.4 |
| Language | TypeScript (frontend), Python 3.x (pipeline) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase (Postgres via JSONB columns) |
| AI provider | Anthropic only — no other AI providers |
| Hosting | Not yet deployed; runs locally with `next dev` |

### Models in use (from `config.py` and `web/lib/models.ts`)

| Constant | Model ID | Used for |
|---|---|---|
| `REASONING_MODEL` | `claude-opus-4-6` | Triage interview, re-triage, distill Pass 1 & 2 |
| `PIPELINE_MODEL` | `claude-sonnet-4-6` | Sharpen, all four artifact stages, distill Pass 3 |
| `CONVERSE_MODEL` | `claude-sonnet-4-6` | Internal and public conversation |

### Project structure (non-generated files)

```
KSM Studio/
├── triage.py          # Phase 1 — CLI
├── sharpen.py         # Phase 2 — CLI
├── artifacts.py       # Phase 3 — CLI
├── converse.py        # Conversation — CLI
├── distill.py         # Distillation — CLI
├── config.py          # Env + model config
├── db.py              # Supabase clients
├── migrate_transcripts.py
├── web/               # Next.js app (studio + public)
│   ├── app/(studio)/  # Authenticated studio UI
│   ├── app/(public)/  # Public portfolio pages
│   ├── app/api/       # API routes (triage, sharpen, artifacts, converse, distill, …)
│   ├── components/portfolio/  # Public page rendering components
│   ├── components/public/     # Landing-page components
│   └── lib/           # Types, Supabase clients, shared utils
└── web-public/, web-studio/   # Empty stubs — .env.example files only
```

`web-public/` and `web-studio/` contain nothing except a `.env.example` file each. They are not built, not configured, not deployed.

---

## 2. Phase-by-Phase Status

### Phase 1 — Evaluator (called "Triage" in code)

**Status: Fully implemented — CLI. Partially implemented in web UI.**

The intended design calls this the "Evaluator." The code calls it "Triage." It is a Socratic, adversarial stress-test across six dimensions: problem clarity, impact mechanism, effort realism, falsifiability, founder-idea fit, and commercial viability (conditional). Claude runs as a tool-calling agent; the session ends when it calls `complete_interview`.

**What the code actually does:**

- `triage.py: run_triage()` runs the CLI interview. Streams Claude (Opus 4.6 with adaptive thinking) to stdout. Caps at 20 turns. On `complete_interview` tool call, validates and normalises fields (`_validate_fields`), then writes to Supabase `ideas` table and `conversations`/`messages` tables.
- `triage.py: run_retriage()` re-triages an existing idea. Pulls full history, injects prior triage and kill-assumption state into the prompt, appends the result to `triage.triage_history`, increments `triage_version`.
- `web/app/api/triage/route.ts` — a full SSE streaming port of the CLI logic. The web UI at `web/app/(studio)/studio/triage/new/page.tsx` drives this endpoint.
- `web/app/api/triage/retrigger/route.ts` — re-triage endpoint for the web.

**Design vs. implementation gaps:**

- The intended design says "internal dimension-level scores are not exposed to downstream phases or any public surface." This is **not enforced in code**. All scores (`effort_score`, `impact_score`, `confidence`, `category`) are written to the top-level `triage` JSONB column and are visible to every downstream consumer that fetches the idea row. The scores are not stripped before passing context to Phase 2 — `sharpen.py: build_user_message()` explicitly includes the full triage JSON. The isolation is only a prompt instruction ("Never reveal scores … during the session"), not a structural boundary.
- "Tries to break the idea" is accurate. The system prompt is genuinely adversarial.
- The re-triage path is fully built in both CLI and web.

---

### Phase 2 — Researcher (called "Sharpening" in code)

**Status: Fully implemented — CLI and web API. No dedicated web UI trigger beyond the idea detail page.**

**What the code actually does:**

- `sharpen.py: main()` fetches `raw_input` and `triage`, constructs a prompt, runs Claude Sonnet 4.6 with the built-in `web_search_20250305` tool (server-side Anthropic tool, not a third-party API), handles `pause_turn` continuations up to 5 times, parses the structured output, and writes `development` JSONB to Supabase.
- Output shape: `research_synthesis`, `competitive_landscape`, `problem_statement`, `core_hypothesis`, `personas` (JSON array), `open_questions`.
- `web/app/api/sharpen/route.ts` — a complete SSE-streaming port of the CLI logic, including the search-event signalling and pause_turn continuation. Triggered from the idea detail page.

**Design vs. implementation gaps:**

- The intended design calls this "Researcher — conducts market and product research that supports the validated idea — constructive, not adversarial." The code is constructive but the system prompt is also willing to contradict the idea if research warrants it ("Do not produce optimistic output to match the user's enthusiasm. A sharpening pass that only confirms what the user already believed is worthless."). This is a minor framing discrepancy, not a functional gap.
- Sharpening runs on all ideas regardless of triage disposition. There is no gate that prevents running it on a `park` or `discard` idea. The CLI's `run_triage()` prints "Next: python sharpen.py" unconditionally. The intended design says sharpening "runs only on ideas that pass the Evaluator." No such check exists in `sharpen.py` or the web route.

---

### Phase 3 — Artifact Creator

**Status: Fully implemented — CLI and web API.**

**What the code actually does:**

- `artifacts.py: main()` runs four sequential prompt stages: PRD, MVP Scope, Next Steps, Builder Brief. Each stage uses a dedicated system prompt, a context-builder function that packages upstream artifacts, and a section-map parser that extracts structured data from Claude's markdown output. Each stage writes its parsed output immediately to `ideas.development` in Supabase (fail-safe). Supports `--from <stage>` to resume and `--dry-run`.
- `web/app/api/artifacts/route.ts` — a complete port, also supporting `from_stage`. Streams progress events per stage. Marks `state = "developed"` on completion.
- Builder brief system prompt explicitly names Lovable, v0, and Claude Code as intended consumers.

**Design vs. implementation gaps:**

- The intended design says "a research brief, PRDs, and a roadmap." The code produces PRD + MVP scope + next steps + builder brief — a superset of "research brief + PRD + roadmap." The naming is loose but the intent is covered.
- No gap between design and implementation for this phase beyond naming.

---

### Phase 4 — Builder

**Status: Not started. No code exists.**

**What the intended design describes:** Generates four prototype directions as visual tiles; user selects one, blends, talks to it, fine-tunes, or restarts. Chosen direction is built to the PRD specification.

**What the code actually contains:** Nothing. There is no builder agent, no prototype tile generation, no direction selection UI, no blending mechanism, no fine-tuning loop. The builder brief generated in Phase 3 is a document addressed to an external tool (Lovable, v0, Claude Code). The Kiln does not invoke any of those tools. The user must manually copy the builder brief and run it in a separate environment.

The `builder_brief` artifact is the end of the Kiln's automated involvement. Everything after that is manual.

---

### Phase 5 — Deployer

**Status: Not started. No code exists.**

**What the intended design describes:** Creates a GitHub repository and hands the final build to an IDE such as Cursor for refinement and publishing.

**What the code actually contains:** Nothing. No GitHub API calls, no repo creation, no IDE handoff, no deployment automation. The system ends at the builder brief.

---

## 3. Data Flow and Handoffs

### How an idea moves through the pipeline

```
User types idea
    ↓
triage.py / POST /api/triage
    → Claude interview (Opus 4.6, adaptive thinking, tool use)
    → complete_interview tool called
    → writes ideas row: { id, raw_input, domain, triage_version, triage: { ...scores } }
    → writes conversations + messages rows
    ↓
sharpen.py / POST /api/sharpen
    → reads: ideas.raw_input, ideas.triage
    → Claude + web_search (Sonnet 4.6)
    → writes ideas.development: { research_synthesis, competitive_landscape,
                                   problem_statement, core_hypothesis, personas,
                                   open_questions, sharpened_at }
    → sets ideas.state = "sharpened"
    ↓
artifacts.py / POST /api/artifacts
    → reads: ideas.raw_input, ideas.triage, ideas.development
    → Claude ×4 (Sonnet 4.6, no tools)
    → writes ideas.development.prd, .mvp_scope, .next_steps, .builder_brief (incrementally)
    → sets ideas.state = "developed"
    ↓
[MANUAL — user copies builder brief to Lovable / v0 / Claude Code]
    ↓
distill.py / POST /api/studio/ideas/[id]/distill
    → reads: full idea row + journal_entries + outcomes
    → Claude ×3 (Pass 1: Opus; Pass 2: Opus; Pass 3: Sonnet)
    → writes ideas.portfolio: { versions: [...], active_version_id, slug, headline, published }
    ↓
ideas.published = true → appears at /projects/[slug]
```

### Data structure passed between phases

There is no explicit handoff object. Each phase reads directly from the `ideas` row in Supabase. The handoff is the database row itself. There are no typed contracts between phases beyond the shared TypeScript types in `web/lib/types.ts` and the implied schema in each stage's context-builder function.

### Are isolation contracts enforced?

**No.** The most explicit isolation requirement in the design — that the Evaluator's internal scores not be exposed downstream or publicly — is not enforced structurally:

1. `build_user_message()` in `sharpen.py` (line 190) passes `json.dumps(triage, indent=2)` directly to Claude, including all scores.
2. The `converse.py` system prompt (line 25) reads `triage` and explicitly includes `effort_score`, `impact_score`, `confidence`, and `category` in the prompt block.
3. The public `/projects/[slug]` page reads `ideas.portfolio`, which is AI-generated from the full triage including scores. The distillation pipeline's `_build_idea_context()` in `distill.py` (line 441) includes triage scores in the context block.
4. The studio idea detail page (`IdeaDetailShell.tsx`) renders triage scores visibly in the UI.

Scores are not exposed directly to the public page visitor, but they are not isolated from downstream AI agents, the studio UI, or the internal conversation mode.

---

## 4. Guardrails

### Schema validation

**Partial.** The triage output has explicit field validation in `_validate_fields()` (`triage.py`: 576) and its TypeScript equivalent (`web/app/api/triage/route.ts`: 49). This covers: category derivation, disposition consistency, time_horizon enum mapping, kill_assumption normalisation. 

The sharpen and artifact stages have **no schema validation**. Their outputs are parsed by regex-based section extractors. If Claude returns a malformed or missing section, the extractor silently returns an empty string or empty list. There is no Zod schema, Pydantic model, or structural assertion on those outputs.

The portfolio/distillation layer uses Anthropic tool_use with JSON Schema-validated tool inputs (see `COMPLETE_CHARACTER_TOOL`, `COMPLETE_PRESENTATION_TOOL`, `COMPLETE_CONTENT_TOOL` in `distill.py`). This is the most rigorous schema enforcement in the codebase.

**Summary:** Validation exists at triage (field-level) and distillation (tool schema). It is absent for sharpening and artifact generation.

### Retry logic

**Present but narrow.** All streaming calls implement `pause_turn` continuation — if Claude's output is interrupted mid-generation, the code resumes up to 5 times. This handles token-limit and server-interruption cases.

There is **no retry on transient API errors** (5xx, rate limits, network failures). If `client.messages.stream()` throws, the outer `except` block in each route terminates the stream with an error event and the pipeline stops.

There is no exponential backoff, no dead-letter queue, no resumption from a failed stage.

### Versioned artifacts

**Partial — triage only.** Triage has explicit versioning: `triage_version` column, `triage_history` array inside the `triage` JSONB, and `save_retriage()` which snapshots the current triage before overwriting.

Sharpening, artifacts, and distillation are **overwrite-only**. Each run replaces `ideas.development` (or the relevant sub-key) with the new output. There is no history, no diff, no rollback.

Portfolio distillation does have versioning: `portfolio.versions[]` is an append-only array, and `portfolio.active_version_id` tracks the live version. The studio UI supports activating, archiving, and branching versions. This is the only non-triage versioned artifact.

---

## 5. What Works End to End

**Can be run start to finish today:**

1. Submit a new idea via the web triage UI (`/studio/triage/new`) → Claude interviews → idea saved to Supabase.
2. Trigger sharpening from the idea detail page → web search runs → development object written.
3. Trigger artifact generation from the idea detail page → four-stage chain runs → PRD through builder brief written.
4. Hold a conversation with the idea in internal or public mode via the studio ConversationsPanel.
5. Run distillation from the Portfolio tab → three-pass pipeline runs → `portfolio.versions` populated.
6. Mark the idea published via the PublishToggle → appears at `/projects/[slug]` with full portfolio render and chatbot.

**What breaks or is missing along the way:**

- **Phase 4 (Builder):** After the builder brief is generated, the pipeline stops. The user must manually take the builder brief to an external tool. There is no in-Kiln building.
- **Phase 5 (Deployer):** Does not exist. No GitHub repo creation, no IDE handoff.
- **Sharpening gate:** No code checks whether an idea has a `pursue` or `potential` disposition before running sharpening. Any idea — including `discard` — can be sharpened.
- **Artifact gate:** `artifacts.py` checks for the presence of `triage` and `development.problem_statement` but does not check disposition. The web route has no gate check at all.
- **Distillation invocation:** The `/api/studio/ideas/[id]/distill` route spawns `distill.py` as a child process (`spawn("python3", args)`). This means the web server must be running on the same machine as the Python environment, with the same working directory. This will not work in any standard hosting environment (Vercel, Railway, etc.).
- **No deployed instance:** The web app is not deployed anywhere. `web-public/` and `web-studio/` are empty directories.
- **Auth is not enforced on pipeline routes:** `/api/triage`, `/api/sharpen`, `/api/artifacts`, and `/api/converse` do not check for an authenticated session. Only `/api/studio/ideas/[id]/distill` checks `supabase.auth.getUser()`. Anyone with network access to the local server can invoke the pipeline.
- **No message saving after conversation:** The converse route (`/api/converse/route.ts`) saves the user message before the stream starts but does **not** save the assistant response. The `save` and `summarize` sub-routes exist (`/api/converse/save`, `/api/converse/summarize`) but are separate endpoints the client must call explicitly.
- **Cover images are placeholders:** `getFeaturedPublicProjects()` hardcodes `coverImage: "/placeholder.svg"` for every project. There is no image generation or upload.
- **Error handling for Supabase writes is inconsistent:** CLI scripts exit on write failure. Web routes emit an error SSE event and close the stream, but the client may or may not surface this to the user.

---

## 6. Honest Gap List

- **Phase 4 (Builder) is entirely missing.** No prototype tile generation, no direction selection, no blend/talk/fine-tune loop, no building to PRD spec.
- **Phase 5 (Deployer) is entirely missing.** No GitHub repo creation, no IDE handoff, no publish automation.
- **The "strict handoffs" described in the design are not strict.** Data moves via shared Supabase reads. There are no typed handoff contracts, no intermediate validation, no acknowledgment protocol between phases.
- **Evaluator score isolation is not enforced.** All scores are visible to downstream agents and to the studio UI. The isolation exists only as a prompt instruction.
- **Sharpening does not gate on triage disposition.** `discard` and `park` ideas proceed through the full pipeline if the user triggers it.
- **No retry logic on API errors.** Only `pause_turn` continuation is handled; transient failures terminate the pipeline.
- **Artifact outputs have no schema validation.** Sharpening and artifact stages use regex parsing with silent empty-string fallbacks on missing sections.
- **Versioning is limited to triage and portfolio.** Sharpening and artifact stages are overwrite-only with no history.
- **Distillation is not production-hostable** as a web route in its current form (child process spawning `python3 distill.py`).
- **Auth is absent on most pipeline API routes.** `/api/triage`, `/api/sharpen`, `/api/artifacts`, `/api/converse` are open.
- **Assistant messages are not auto-saved** from the web converse route. Client must separately call `/api/converse/save`.
- **The "public gallery" (landing page)** is built with static components but uses placeholder cover images and has no published ideas to display until the full pipeline has been run and a project manually published.
- **`web-public/` and `web-studio/`** are empty placeholder directories — whatever split architecture was intended here has not been built.
- **No `domain` field prompt in the web triage UI.** The CLI prompts for domain after the interview; the web route infers it from `rawInput` without asking.
- **The personal AI assistant ("Jarvis") vision** — the long-term goal stated in the design — has no code representation. The Kiln is standalone; there is no scaffolding for a broader assistant layer.
- **No CI, no tests, no linting configuration** beyond `eslint-config-next`. There is no test suite of any kind.
