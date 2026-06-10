# Atelier v2 — Gap Audit of the Current KSM Studio Codebase

Read-only audit. No source files were modified. Every claim below is anchored to a file path so you can verify it.

Date: 2026-06-08. Branch audited: `phase45-workspace-verification`.

---

## 1. The real current architecture

### 1.1 Two codebases, one database

There are two distinct implementations sharing one Supabase Postgres instance:

1. **A Python CLI pipeline at the repo root** — `triage.py`, `sharpen.py`, `artifacts.py`, `distill.py`, `converse.py`, plus `config.py` (model routing) and `db.py` (Supabase clients). These are terminal programs you run by hand, in sequence.
2. **A Next.js 16 app in `web/`** — the studio (authenticated) and the public portfolio, plus API routes that *re-implement the same prompts* (`web/app/api/triage/route.ts`, `web/app/api/sharpen/route.ts`, `web/app/api/artifacts/route.ts`, prompt text mirrored in `web/lib/triage-shared.ts`) and, for distillation, *shell out to the Python script* via `spawn("python3", ...)` (`web/app/api/studio/ideas/[id]/distill/route.ts:1`, and `web/app/api/studio/ideas/[id]/workspace/chat/route.ts:181`).

That second point matters: the web app and the Python pipeline are not cleanly separated services. The workspace chat route literally spawns `python3 distill.py` from `process.cwd()/..` (`workspace/chat/route.ts:179-181`). This coupling will not survive a serverless deploy — consistent with the master doc's "Phase 5 — Deployment: NOT STARTED."

There is meaningful **prompt duplication**: the triage, sharpen, and artifacts system prompts exist in both Python and TypeScript and must be hand-kept in sync. Model IDs are centralized (`config.py:13-22`, `web/lib/models.ts`) but the prompts are not.

### 1.2 Data model (Supabase)

Five tables (per `supabase-rls-policies.sql` and `docs/master-context.md`): `ideas`, `journal_entries`, `refinements`, `conversations`, `messages`.

The `ideas` row is the spine of everything. Queryable signals are columns; rich content is JSONB. The shape is documented in `web/lib/types.ts`:
- Columns: `published`, `triage_version`, `retriage_pending`, `retriage_reasons`, `domain`, `state`, `raw_input` (`web/lib/types.ts:283-302`).
- JSONB blobs: `triage`, `development`, `portfolio`, `outcomes`.
  - `triage` carries scores, `kill_assumptions` (objects `{text, status, status_source...}`, `web/lib/types.ts:7-12`), and `triage_history[]` snapshots.
  - `development` carries sharpening outputs (`research_synthesis`, `problem_statement`, `core_hypothesis`, `personas`, `open_questions`) and artifacts (`prd`, `mvp_scope`, `next_steps`, `builder_brief`) (`web/lib/types.ts:123-138`).
  - `portfolio` carries `versions[]` with a single `active_version_id` pointer, plus per-version `character_card`, `presentation`, `public_summary`, `chatbot_context`, `voice`, and `snapshots[]` (working-draft FIFO) (`web/lib/types.ts:142-205`).

The model is **deliberately rigid where it queries and flexible where it reads**. The TypeScript types are tight (enums for `time_horizon`, `accent_color`, `archetype`, etc.), but the database itself enforces none of that — JSONB is schemaless, and validation is done in application code (see 1.4). `kill_assumptions` accepts both string and object forms and is normalized on read/write (`triage.py:623-633`), which tells you the schema evolved and back-compat is handled defensively.

### 1.3 End-to-end flow of an idea

The pipeline is strictly linear and **judgment-first**:

1. **Triage (Intake + Judgment fused).** `triage.py` / `POST web/app/api/triage/route.ts`. A Socratic interview (system prompt: *"You are a Socratic evaluator… stress-test both the idea and the thinking"*, `triage.py:43-48`) probing six dimensions (problem clarity, impact mechanism, effort realism, falsifiability, founder–idea fit, commercial viability, `triage.py:83-126`). Capped at `MAX_TURNS = 20` (`triage.py:679`). On completion Claude calls the `complete_interview` tool, the result is validated (`_validate_fields`, `triage.py:576`), and a new `ideas` row plus a `conversations(context='triage')` + `messages` transcript are written (`triage.py:638-674`). Prior triages are injected for adaptive difficulty (`fetch_prior_triages`, `triage.py:682-721`).
2. **Sharpen (Research).** `sharpen.py` / `web/app/api/sharpen/route.ts`. Runs Claude with the **web_search server tool** (`sharpen.py:219`), three prescribed searches, then produces problem statement / hypothesis / personas / open questions → written to `ideas.development` (`sharpen.py:342-345`).
3. **Artifacts.** `artifacts.py` / `web/app/api/artifacts/route.ts`. Chains four stages: `prd → mvp_scope → next_steps → builder_brief` (`artifacts.py:38`), each writing to `ideas.development` as it completes. Prerequisites are enforced (`validate_prerequisites`, `artifacts.py:787`).
4. **Distill (Manifestation, but gated).** `distill.py` / `web/app/api/studio/ideas/[id]/distill/route.ts`. Three tool-validated passes: character → presentation → content (`distill.py:689-790`), producing a `portfolio.versions[]` entry. **It refuses to run unless the idea has been sharpened** (`distill.py:715-717`).
5. **Publish.** `web/app/api/ideas/[id]/publish/route.ts` sets `published` + slug.
6. **Public agent.** `/projects/[slug]` and `/p/[slug]` pages + `POST web/app/api/projects/[slug]/chat/route.ts`. Streams a per-idea public chatbot built from the active version's `chatbot_context` + refusals.
7. **Workspace (Phase 4.5 editing).** `web/app/api/studio/ideas/[id]/workspace/*` — open/update/snapshot/save-as-version/revert + a chat route where the idea proposes `PROPOSED EDIT` blocks the user accepts/rejects, triggering a scoped re-distill (`workspace/chat/route.ts`).
8. **Tending seeds.** `converse.py` internal mode (Tier 2) detects "triage insights" and flags `retriage_pending` (`_flag_for_retriage`, `converse.py:664-687`); `outcomes` JSONB stores a predicted-vs-actual timeline.

### 1.4 LLM integration, guardrails, versioning

- **Model routing.** Opus 4.6 for reasoning (triage, distillation passes 1–2), Sonnet 4.6 for pipeline/converse/content (`config.py:13-19`, `web/lib/models.ts`). Adaptive thinking enabled on triage and sharpen (`triage.py` stream config; `sharpen.py:217`).
- **Schema validation — uneven.**
  - *Strong:* triage uses a forced tool (`complete_interview`) plus a post-hoc corrector that fixes/normalizes `category`, `disposition`, `time_horizon`, and `kill_assumptions` (`triage.py:576-635`; mirrored in `web/app/api/triage/route.ts:49-`). Distillation forces structured output via `tool_choice` on `COMPLETE_CHARACTER/PRESENTATION/CONTENT_TOOL` (`distill.py:486-497`) — Anthropic enforces the JSON schema.
  - *Weak:* sharpen and artifacts parse **free-form text by regex/heading matching** (`sharpen.py:258-339`, `artifacts.py:427-511`) and silently fall back to raw strings on parse failure (`sharpen.py:312-313`). No schema guarantee on `development` sub-objects from these stages.
- **Retries — minimal.** sharpen handles `pause_turn` continuation up to `max_continuations = 5` (`sharpen.py:209-252`); distillation raises on a missing tool call with no retry (`distill.py:497`); no parse-failure retry anywhere. There is no retry/backoff wrapper around the Anthropic calls.
- **Versioning — genuinely solid.** Three independent "full history + single active pointer" implementations: `triage_history[]` snapshots, `portfolio.versions[]` with `active_version_id`, and working-draft `snapshots[]` (FIFO, 20-deep). The workspace accept-flow snapshots before distilling, runs a scoped re-distill, merges only the affected fields, and removes the throwaway version (`workspace/chat/route.ts:160-260`).
- **Isolation — real at the data layer, leaky at the prompt layer.** RLS restricts `anon` to `published` ideas and `portfolio_public` conversations (`supabase-rls-policies.sql`). Route-level checks pin workspace conversations to `context='workspace_edit'` and reject mismatches (`workspace/chat/route.ts:90-97`). The public prompt composer deliberately **omits the development block** (`buildDevBlock` is defined but never called — `compose-system-prompt.ts:13`), filters internal journal types (`compose-system-prompt.ts:62-64`), and appends shared refusals (`refusals.ts`). **But** the public chat route still selects `triage, development, outcomes` into the row it passes around (`projects/[slug]/chat/route.ts:24-28`), and the master doc itself records that the public agent currently leaks ("names kill assumptions verbatim, quotes research findings"). Isolation here is enforced by *prompt discipline + distillation quality*, not by a hard data boundary.

---

## 2. Implemented vs. stubbed inventory

**Genuinely implemented and working (per code + commit history):**
- Socratic triage with schema validation and adaptive difficulty — Python + web (`triage.py`, `web/app/api/triage/route.ts`).
- Web-search-grounded sharpening (`sharpen.py`).
- Four-stage artifact generation (`artifacts.py`).
- Three-pass, tool-validated distillation into versioned portfolio entries (`distill.py`).
- Public portfolio pages + per-idea public chatbot with RLS, rate limiting (`portfolio/rate-limit.ts`), and refusal scaffolding.
- Phase 4.5 workspace: toolbar (template/accent/sections/signature), chat with PROPOSED EDIT accept/reject, scoped re-distill, working-draft snapshots, history drawer (the bulk of `web/app/(studio)/studio/ideas/[id]/_components/`).
- Internal (Tier 2) converse with triage-insight detection and retriage flagging (`converse.py`).
- Outcomes timeline with predicted-vs-actual (`web/lib/types.ts:208-230`, OutcomesPanel).

**Stubbed, placeholder, or absent:**
- **Master / cross-idea agent (Tier 1):** not built. No code reads across ideas as an agent. Confirmed by master doc and by absence in the codebase.
- **Thinking Profile / mentorship layer:** not built.
- **"Builder":** there is only a `builder_brief` — a *generated text document* (`artifacts.py:614-690`). There is no Builder agent, no connector recommendation/approval, no coding-agent handoff, no wiring.
- **"Deployer":** does not exist anywhere in the code.
- **RAG / embeddings / vector store:** **does not exist.** A full search for `embed|pgvector|vector|rag|cosine|faiss|chroma|pinecone` returns only prose matches ("paragraph", "embed as the assistant message"). "Research" = the web_search server tool + stuffing Postgres rows into prompts (`distill.py:_build_idea_context`, `compose-system-prompt.ts`). This is context assembly, not retrieval-augmented generation.
- **Public content filtering:** known leak (master doc; route passes internal blobs around).
- **Background automation / scheduling / cron:** none. Every "agent" runs only when a human triggers it.
- **Signatures:** placeholder gradient blocks (master doc).
- `thinking.md` is empty (0 bytes); `friction.md` is a one-line template stub.

**Correction to your stated belief:** you described "an Evaluator, a Researcher, and an Artifact Creator, with a Builder and Deployer designed but not implemented," plus "RAG pipelines." Evaluator (triage), Researcher (sharpen), Artifact Creator (artifacts) are real. But there is no Builder *designed in code* — only a brief document; the Builder is net-new. The Deployer is absent entirely (not even scaffolded). And there are **no RAG pipelines** — that framing should be retired. The "multi-tier agent architecture" is best understood as **stateless, per-idea, prompt-configured Claude calls that rebuild their context from Postgres on every request** — not persistent agents. Isolation is enforced by RLS + route checks + prompt composition, which is real but coarser than "isolation contracts" implies.

---

## 3. Gap analysis against Atelier v2

Classification legend: **Reusable as-is** · **Needs adaptation** · **Net-new** · **Contradicts**.

| Target element | Classification | Code evidence & justification |
|---|---|---|
| **Spine: taste model as compounding editable context; discriminator judging substance + form; models direction & blind spots; logs where instinct was wrong** | **Mostly Net-new** (some Needs adaptation) | Seeds exist but no spine. Substance judgment lives inside the triage generator (`triage.py` six dimensions, scores, `growth_observations`), and "where instinct was wrong" exists only as manual `predicted_vs_actual` deltas in `outcomes` (`web/lib/types.ts:215-222`). Form judgment lives separately inside distillation's presentation pass (`distill.py` pass 2). There is no unified, *editable*, *compounding* taste context, no clean substance-vs-form split, and no automatic blind-spot log. The triage/outcomes signals are adaptable inputs; the discriminator-as-spine is net-new. |
| **Director (you)** | **Reusable as-is** | The whole system already assumes a single human operator (auth'd studio, `userEmail` gating, manual pipeline triggering). |
| **Studio-Mind orchestrator (single coordinator, keeps machine running, surfaces the few things worth attention)** | **Net-new** | No orchestrator exists. Today the human *is* the orchestrator, running CLI scripts in order or clicking through `web/app/(studio)`. The master doc's "Tier 1 master agent" is explicitly unbuilt. Nothing coordinates the crew or surfaces a prioritized few. |
| **Crew: a few conversational voices + many invisible automation hands** | Voices: **Needs adaptation**; Hands: **Net-new** | Conversational voices exist as per-idea chat (`converse.py` Tier 2, public chat, workspace chat) — but it's *one* voice per idea, not a crew of temperaments, and each is stateless. The "invisible automation hands" have no counterpart: there is no background job, queue, scheduler, or autonomous task runner anywhere. |
| **Five stages — Intake (frictionless capture, lazy light research)** | **Contradicts** | Current intake is the *opposite* of frictionless: a 20-turn adversarial Socratic interview (`triage.py:679`, `SYSTEM_PROMPT` "pushes them one level deeper"). Capture and judgment are fused into one heavyweight gate. Lazy light research doesn't exist — sharpen is a separate, deliberate, full web-search pass. |
| **Five stages — Manifestation (cheapest watchable cut, before judgment)** | **Net-new + Contradicts ordering** | The only "manifestation" is distillation into a portfolio page, and it is *gated behind* sharpening (`distill.py:715-717`) and typically artifacts. There is no cheap, early, watchable cut. See §4-bis on the inversion. |
| **Five stages — Judgment** | **Reusable as-is → Needs adaptation** | Triage is the strongest existing asset and maps directly to Judgment. It needs adaptation only to (a) run *after* manifestation and (b) gain a fast mode (see Kiln). The schema-validated evaluation core is reusable. |
| **Five stages — Build (taste-dense brief to a coding agent)** | **Needs adaptation** | `builder_brief` already compresses triage+PRD+MVP+next-steps into a single standalone brief written "directly to the developer" (`artifacts.py:614-690`, "must stand alone"). That is a usable *input* to a coding-agent handoff, but the handoff itself, and the "taste-dense" injection from the spine, are missing. |
| **Five stages — Tending (kept current, re-tested, connected)** | **Needs adaptation + Net-new** | Seeds: outcomes timeline, `retriage_pending` flagging, triage-insight detection (`converse.py:664-687`). But "re-tested" (e.g., periodic web-search against kill assumptions) and "connected" (cross-idea) are unbuilt; the master doc files them under future "ideas as living agents." |
| **Production-first inversion (Manifestation before Judgment)** | **Contradicts (deepest cut)** | The architecture is hard-wired judgment-first. Manifestation (`distill.py`) *errors out* if the idea isn't sharpened, and sharpening presupposes a completed triage. The data dependency runs triage → development → portfolio in one direction. Inverting this is not a reorder of UI steps; it requires a manifestation path that runs off raw intake with no triage/development present. See §4-bis. |
| **Two-speed Kiln (fast first-read default + deliberate deep adversarial dive)** | Deep dive: **Reusable as-is**; Fast read: **Net-new** | Triage *is* the deep adversarial dive (single-speed, `MAX_TURNS=20`, adaptive thinking). There is no fast first-read mode — every evaluation pays full cost. The fast path is net-new; the existing engine becomes the deliberate second speed. |
| **Diverge-then-converge: 4 temperaments (Clay/August/Cedar/Wren) producing divergent on-brief proposals; pick & combine** | **Net-new** (plumbing: Needs adaptation) | Distillation produces exactly **one** version per run (`distill.py:752-766`). The workspace can branch versions, but sequentially via briefs, not as a parallel fan-out of named temperaments. No personas, no divergence, no combine step. The versioning/branch plumbing (`portfolio.versions[]`, branch route) is reusable scaffolding; the fan-out itself is net-new. |
| **Idea-agents: each surviving idea is a live, persistent, self-evolving, self-manifesting agent** | **Needs adaptation** | The per-idea "agent" today is a stateless prompt assembly rebuilt from Postgres on each request (`compose-system-prompt.ts`, `converse.build_system_prompt`). The DB gives *data* continuity and the retriage-insight loop is the explicit seed (master doc), but there is no persistent process, no autonomous evolution, no self-manifestation. Data layer reusable; the live-agent loop is net-new. |
| **Builder: conversational, recommends connectors for approval, wires approved ones, hands brief to coding agent** | **Net-new** (brief content: Needs adaptation) | Only the static `builder_brief` exists. No connector catalog, no recommendation, no approval flow, no wiring, no coding-agent integration. The brief format is a partial input; everything else is net-new. |
| **Governing discipline — bounded iteration as explicit numbers** | **Needs adaptation** | Numbers exist but scattered and incidental: `MAX_TURNS=20` (`triage.py:679`), `max_continuations=5` (`sharpen.py:209`), 20-snapshot FIFO. Not a unified, surfaced discipline. |
| **Governing discipline — clean handoff artifacts at stage boundaries** | **Needs adaptation** | The `development` JSONB *is* the handoff between stages, and prerequisites are checked (`artifacts.validate_prerequisites`, `distill.py:715`). The boundaries are real but the artifacts are implicit (a growing blob), not explicit, named, frozen handoffs. |
| **Governing discipline — human gates at high-stakes points** | **Reusable as-is** | Real gates already: publish toggle (`ideas/[id]/publish`), draft-vs-active version status (`distill.py:765`), accept/reject on every workspace proposal (`workspace/chat/route.ts`). |
| **Governing discipline — observability on demand** | **Needs adaptation** | SSE streams distill progress to the workspace UI (`workspace/chat/route.ts` `distill_progress` events); CLI prints to stderr. Partial and ad hoc; no unified observability surface. |
| **Gallery: outward-facing published ideas with isolation contract** | **Reusable as-is → Needs adaptation** | Public surface exists: `/projects/[slug]`, `/p/[slug]`, public chat, RLS, rate limit, refusals. Adaptation needed: there is no gallery *index* (only per-slug pages + a featured list via `lib/get-featured-public-projects.ts`), and the isolation contract has a known prompt-level leak to close. The skeleton is genuinely reusable. |

### 4-bis. How deep the production-first inversion cuts (you asked specifically)

Deeper than a workflow reorder. Three structural facts make the current system judgment-led at the bedrock:

1. **A hard code gate.** `distill.py:715-717` aborts manifestation unless `development.problem_statement` exists. Manifestation cannot run on a raw idea today.
2. **A one-directional data dependency.** `portfolio` (manifestation) is built by reading `triage` + `development` (`distill.py:_build_idea_context`, `_build_artifact_inventory`). The manifestation pass has no path that synthesizes a watchable cut from `raw_input` alone.
3. **Intake and judgment are the same act.** Triage is simultaneously the capture step and the evaluation step (`triage.py` — the interview *is* the scoring). To put manifestation first, intake must be cleaved from judgment so something exists to manifest *before* any score.

So inverting the order means: a new manifestation path that runs off raw intake (net-new), decoupling capture from triage (contradicts current fusion), and demoting triage to an on-demand second stage (adaptation of an otherwise reusable engine). The distillation generator (passes 2–3, the form/content machinery) is reusable as the manifestation engine; what changes is *what feeds it and when*.

---

## 4. What is genuinely salvageable

These are the bricks worth carrying into Atelier, with the least rework:

1. **The Supabase data model.** The columns-for-queries / JSONB-for-content split, the kill-assumption-as-object pattern, and especially the **versioning idiom** (full history + single active pointer, used three times) are mature and forward-compatible. Reuse directly.
2. **The triage evaluator** (`triage.py` + `web/lib/triage-shared.ts`). The six-dimension Socratic engine plus tool-based extraction and field correction is the cleanest, most production-grade piece. It becomes the *deep* speed of the two-speed Kiln.
3. **The distillation generator** (`distill.py` passes 2–3). Tool-validated character/presentation/content generation is the natural Manifestation engine once decoupled from the sharpening gate.
4. **Portfolio versioning + working-draft snapshots.** Reusable as idea-agent state and as the substrate for diverge-then-converge (the branch plumbing already exists).
5. **The public surface + RLS skeleton** (`projects/[slug]`, public chat, `supabase-rls-policies.sql`, `rate-limit.ts`, `refusals.ts`). This is the Gallery foundation; it needs the leak closed and an index added, not a rebuild.
6. **The workspace accept/reject + scoped re-distill loop** (`workspace/chat/route.ts`). A working pattern for "bounded iteration + human gate," directly applicable to the Builder approval flow and to converge.
7. **Model routing** (`config.py`, `web/lib/models.ts`) and the **Next.js app shell** (auth, SSE streaming infra, studio layout).

Carry with caution: the Python⇄web prompt duplication and the `spawn("python3")` coupling are technical debt that the rebuild should resolve (one source of truth, no shelling out across runtimes).

---

## 5. Verdict

What exists is a well-engineered but **judgment-led, single-player, human-orchestrated idea pipeline**: a strong Socratic evaluator, a web-search researcher, an artifact generator, and a tool-validated portfolio distiller, persisted in a genuinely good versioned data model with a real (if prompt-leaky) public isolation layer. What Atelier v2 describes is a **production-first, orchestrator-led, multi-voice studio** — and the distance is large and structural, not cosmetic. The data model, the triage engine, the distillation/versioning machinery, and the public-isolation skeleton are real bricks you can build on (roughly five or six salvageable components), but the taste spine, the Studio-Mind orchestrator, the temperament fan-out, the persistent self-manifesting idea-agents, the real Builder, and the automation hands are all net-new — and the production-first inversion fights the current code at the root, where manifestation is literally gated behind judgment (`distill.py:715`) and intake *is* judgment. Treat this as a re-architecture that harvests its best parts, not a refactor: keep the evaluator and the data/versioning layer, reuse the distiller as a manifestation engine, and build the spine, the orchestrator, the crew, and the inverted flow new.
