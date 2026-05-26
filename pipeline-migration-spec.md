# KSM Studio — Five-Phase Pipeline Migration Spec
### Implementation-ready. All open questions resolved 2026-05-25.

---

## How to read this document

Sections 1–3 describe the target state for each phase — what it produces, what the prompts say, what the parsers do. Section 4 covers web API routes. Section 5 covers types. Section 6 covers validation and versioning. Section 7 is the migration order that keeps GeoNews live throughout.

Do not skip section 7. The migration order matters.

One thing explicitly out of scope: the two artifact-list sentences on the public `/kiln` page. Those describe Researcher and Artifact Creator outputs. Update them **after** the implementation is complete and the new artifact sets are confirmed working — in step with the code, not ahead of it.

---

## Summary of decisions

| OQ | Decision |
|---|---|
| #1 `open_questions` | Stays in Researcher. `core_hypothesis` and `personas` move to Artifact Creator as new "Definition" stage. |
| #2 `problem_statement` | Option A — explicitly extracted from `user_problem_brief` and written as a separate key for backward compat. |
| #3 `mvp_scope` key | Keep storage key `mvp_scope`. UI label reads "MVP Definition". No JSONB migration. |
| #4 Success metrics | Option C — `metrics_summary` (2-sentence reference) stays in PRD. Full `metrics_plan` is the standalone artifact. |
| #5 `next_steps` + `builder_brief` | Soft-deprecate. Removed from default STAGES. Remain runnable via `--from`. |
| #6 Auth | Add `supabase.auth.getUser()` to `/api/sharpen` and `/api/artifacts` in this migration. |
| #7 Disposition gate | Gate Researcher and Artifact Creator on `pursue` / `potential`. CLI: `--force` flag. Web: `{ "force": true }` in body. |
| #8 Technical Feasibility | Conditional depth. Required field; depth varies by whether a material technical dependency exists. |

---

## 1. Phase 2 — Researcher (`sharpen.py` + `/api/sharpen`)

### 1a. What it produces after migration

All written as flat keys into `ideas.development`:

| Key | Type | Status | Description |
|---|---|---|---|
| `research_synthesis` | string | kept | 3–5 sentence honest synthesis |
| `market_brief` | string | **NEW** | 2–3 paragraphs: buyers, demand signals, timing |
| `competitor_matrix` | `CompetitorEntry[]` | **NEW** | Structured competitor list, replaces `competitive_landscape` note |
| `competitive_landscape` | string | backward-compat alias | Auto-generated from top entry of `competitor_matrix`; keeps `distill.py` working |
| `user_problem_brief` | string | **NEW** | 3-part structured brief: Who, What problem, Evidence |
| `technical_feasibility_brief` | string | **NEW** | Conditional depth — see 1d |
| `open_questions` | `string[]` | kept | 3–5 ranked questions |
| `problem_statement` | string | backward-compat alias | Extracted from Part 2 of `user_problem_brief`; keeps artifact context builders and `distill.py` working |
| `sharpened_at` | ISO 8601 | kept | Run timestamp |

**Removed from output:** `competitive_landscape` (as a primary key), `core_hypothesis`, `personas`. These are no longer Researcher outputs.

---

### 1b. Disposition gate

Add immediately after fetching the idea row, before any Claude calls.

**`sharpen.py`:**
```python
disposition = (idea.get("triage") or {}).get("disposition", "")
if disposition in ("park", "discard") and not args.force:
    print(f"\033[33m⚠ This idea's disposition is '{disposition}'. "
          f"The Researcher runs on ideas that passed the Evaluator.\033[0m")
    print("  Pass --force to research it anyway. Aborted.")
    sys.exit(0)
```

Add `--force` to the argparse definition:
```python
parser.add_argument("--force", action="store_true",
    help="Run even if triage disposition is park or discard")
```

**`/api/sharpen` route:**
```typescript
const { force = false } = body;
const disposition = (idea.triage as Record<string, unknown>)?.disposition as string;
if ((disposition === "park" || disposition === "discard") && !force) {
  return new Response(JSON.stringify({
    error: `Idea disposition is '${disposition}'. Pass force: true to research it anyway.`
  }), { status: 400 });
}
```

The studio UI should surface this as a "Force Research" secondary button when disposition is `park` or `discard`, separate from the primary trigger.

---

### 1c. System prompt — full replacement

Replace the entire `SYSTEM_PROMPT` in both `sharpen.py` and `route.ts` with the following. The only behavioral change from today is: (1) `core_hypothesis` and `personas` are no longer produced here, (2) four new sections are added, (3) Search 4 is added.

```
You are a market and product researcher. You receive a raw idea and its completed
triage object. Your job is to do two things:

1. Run focused web searches to ground the idea in reality
2. Produce five research artifacts that all subsequent product work builds from

You do not produce hypotheses, personas, or product specs here. Those come next.
Your only job is research — honest, direct, willing to surface findings that
complicate the idea.

## Inputs you will receive
- raw_input: the user's original idea as captured
- triage: the full triage JSON object

## Step 1: Web research (run all four searches before writing any output)

Search 1 — Existing solutions:
Query: "[core problem from raw_input] existing solutions OR tools OR apps"
What you're looking for: direct competitors, adjacent solutions, anything that
suggests this problem has already been solved well enough that the idea needs
repositioning.

Search 2 — Demand signals:
Query: "[core problem from raw_input] reddit OR forums OR 'does anyone' OR
'looking for' OR 'wish there was'"
What you're looking for: real people expressing this problem unprompted.
This is the most honest demand signal available without user interviews.

Search 3 — Kill assumption validation:
For each kill assumption in the triage object, run a targeted search to find
any public evidence that confirms or challenges it.
Query format: "[kill assumption stated as a claim] evidence OR data OR research"

Search 4 — Technical feasibility (conditional):
First assess: does this idea require a novel, unproven, or hard-to-access
technology as a core dependency? If yes: run a search for evidence of that
technology's maturity.
Query: "[core technology or technical approach] implementation complexity OR
technical risks OR failure modes"
If no material technical dependency exists, skip the search and note the absence
in the Technical feasibility brief.

## Step 2: Produce the five research artifacts

### Research synthesis
3–5 sentences. Direct and honest synthesis of all search findings. Be direct
about what you found and what it means for the idea. If a kill assumption looks
empirically shaky, say so plainly — do not soften it.
If a kill assumption is directly contradicted: flag it explicitly —
"Kill assumption [X] appears empirically weak based on [finding]. This should
be resolved before product work proceeds."

### Market brief
2–3 paragraphs:
Paragraph 1 — Who is in this market. Who the buyers are, what segment this idea
falls into, what demand signals the searches found (cite specific findings).
Paragraph 2 — Size and growth signals found. If no reliable size data was found,
say so plainly — do not estimate or infer a number you did not find.
Paragraph 3 — Timing. What in the last 12–18 months makes this idea viable now?
If no timing signal was found, write that honestly. Do not fabricate urgency.

### Competitor matrix
A JSON array of 4–8 entries — raw JSON, no code fence:
[{"name": "", "category": "", "positioning": "", "key_gap": ""}]

Rules:
- name: the product or company
- category: what type of solution this is
- positioning: in one phrase, how they position themselves
- key_gap: the specific thing they do not do that creates space for this idea
If no direct competitor exists, include adjacent solutions and mark each with
category: "adjacent — [what makes it adjacent rather than direct]".
Do not leave this array empty.

### User problem brief
A structured 3-part brief:

Part 1 — Who: the most specific possible description of the primary user. Use
language from triage.who_benefits as a starting point, refined by what the
research found about who actually has this problem. If research revealed the user
is more specific than triage captured, say so.

Part 2 — What: A single, precise paragraph (max 100 words). Must answer four
things in order:
- Who specifically has this problem
- What they currently do without this solution (the workaround)
- Why the workaround is inadequate (the specific friction)
- What a solved world looks like for them
No solution language. No vague descriptors like "many people" or "significant pain."

Part 3 — Evidence: What the research found that confirms or complicates this
problem definition. Cite specific searches. If the research found that the problem
is smaller, more niche, or differently framed than the triage assumed, say so.

### Technical feasibility brief
If material technical dependency exists:
2–4 sentences covering: what technical foundation this idea depends on, whether
that foundation is mature or experimental, what the hardest technical assumption
is, and whether any evidence was found about that assumption.

If no material technical dependency:
One sentence: "This idea does not have a material novel technical dependency;
feasibility is not a limiting factor for the MVP."

### Open questions
3–5 questions ranked by how much the answer could change direction — most
direction-changing first. Numbered list.

These should be genuine open questions — things the research could not answer.
Do not list questions the research already resolved.

## Behavioral rules
- Do not produce core_hypothesis, personas, or any product specification. Those
  are produced in the next phase from your research output.
- If the web research reveals a direct and well-executed competitor, do not
  suppress it. Surface it clearly and frame the open questions around differentiation.
- Do not produce optimistic output to match the user's enthusiasm.
- Be specific or say you don't know. "Many people" and "significant market" are
  not research findings.
```

---

### 1d. `SECTION_MAP` replacement

```python
# sharpen.py
SECTION_MAP = {
    "Research synthesis":          "research_synthesis",
    "Market brief":                "market_brief",
    "Competitor matrix":           "competitor_matrix",
    "User problem brief":          "user_problem_brief",
    "Technical feasibility brief": "technical_feasibility_brief",
    "Open questions":              "open_questions",
}
```

Matching TypeScript:
```typescript
// route.ts
const SECTION_MAP: Record<string, string> = {
  "Research synthesis":          "research_synthesis",
  "Market brief":                "market_brief",
  "Competitor matrix":           "competitor_matrix",
  "User problem brief":          "user_problem_brief",
  "Technical feasibility brief": "technical_feasibility_brief",
  "Open questions":              "open_questions",
};
```

---

### 1e. Parser changes

**Add `competitor_matrix` to the JSON-parsing branch** (same treatment as `personas` was):

```python
# sharpen.py parse_output()
elif key == "competitor_matrix":
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    json_text = fenced.group(1).strip() if fenced else content.strip()
    try:
        result[key] = json.loads(json_text)
    except json.JSONDecodeError:
        result[key] = json_text
```

TypeScript equivalent:
```typescript
} else if (key === "competitor_matrix") {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fenced ? fenced[1].trim() : content.trim();
  try {
    result[key] = JSON.parse(jsonText);
  } catch {
    result[key] = jsonText;
  }
}
```

---

### 1f. Backward-compat aliases — write after parsing

Add this block in `save_development()` (Python) and in the route's Supabase write block (TypeScript) **before** the write call:

**`competitive_landscape` alias** (keeps `distill.py` working):
```python
# Python
matrix = development.get("competitor_matrix")
if isinstance(matrix, list) and matrix and "competitive_landscape" not in development:
    top = matrix[0]
    development["competitive_landscape"] = (
        f"Most comparable: {top.get('name', '')} — {top.get('positioning', '')}. "
        f"Key gap this idea addresses: {top.get('key_gap', '')}"
    )
```

**`problem_statement` extraction** (keeps artifact context builders and `distill.py` working):
```python
# Python
brief = development.get("user_problem_brief", "")
if brief and "problem_statement" not in development:
    # Part 2 is the ≤100-word problem paragraph.
    # Heuristic: find "Part 2" header and capture the paragraph that follows.
    m = re.search(
        r"Part\s+2[^\n]*\n+(.+?)(?:\n\n|Part\s+3|$)",
        brief, re.DOTALL | re.IGNORECASE
    )
    if m:
        development["problem_statement"] = m.group(1).strip()[:500]
    else:
        # Fallback: use the whole brief, truncated
        development["problem_statement"] = brief[:500]
```

TypeScript equivalents follow the same logic.

---

### 1g. Pre-flight check update

`artifacts.py: main()` currently gates on `dev.get("problem_statement")`. Update to accept either old or new rows:

```python
if not dev.get("user_problem_brief") and not dev.get("problem_statement"):
    print("\033[31m✗ No researcher output found. Run sharpen.py first.\033[0m")
    sys.exit(1)
```

---

### 1h. Versioning addition

Before writing the new researcher output, snapshot the existing researcher keys:

```python
# sharpen.py save_development() — before the write
RESEARCHER_KEYS = [
    "research_synthesis", "market_brief", "competitor_matrix",
    "competitive_landscape", "user_problem_brief", "technical_feasibility_brief",
    "problem_statement", "open_questions", "sharpened_at",
]
existing_dev = idea.get("development") or {}
history = existing_dev.get("sharpening_history", [])
snapshot = {k: existing_dev[k] for k in RESEARCHER_KEYS if k in existing_dev}
if snapshot:
    history.append(snapshot)
development["sharpening_history"] = history
```

Supabase column:
```sql
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS sharpened_version INTEGER DEFAULT 0;
```

Increment `sharpened_version` alongside the `development` write:
```python
db.table("ideas").update({
    "development": development,
    "state": "sharpened",
    "sharpened_version": (current_sharpened_version or 0) + 1,
}).eq("id", idea_id).execute()
```

---

## 2. Phase 3 — Artifact Creator (`artifacts.py` + `/api/artifacts`)

### 2a. Stage list after migration

```python
# Default pipeline — run in order
STAGES = [
    "definition",             # NEW — Core hypothesis + Personas
    "product_strategy_brief", # NEW — Positioning, segment, bets, GTM, why now
    "prd",                    # updated — metrics_summary replaces success_metrics
    "mvp_scope",              # unchanged (storage key); UI label = "MVP Definition"
    "user_journey",           # NEW — Journey stages, emotion arc, touchpoints
    "metrics_plan",           # NEW — North star, leading/lagging, instrumentation
]

# Soft-deprecated — removed from default run, still executable via --from
DEPRECATED_STAGES = ["next_steps", "builder_brief"]

# Full list for --from validation
ALL_STAGES = STAGES + DEPRECATED_STAGES
```

`--from` should accept any value from `ALL_STAGES`. Print a deprecation warning if `next_steps` or `builder_brief` is selected:
```python
if args.from_stage in DEPRECATED_STAGES:
    print(f"\033[33m⚠ '{args.from_stage}' is soft-deprecated and not in the default pipeline. "
          f"Running anyway per --from flag.\033[0m")
```

---

### 2b. Disposition gate (same pattern as Researcher)

```python
# artifacts.py main() — after fetching idea, before running stages
disposition = (idea.get("triage") or {}).get("disposition", "")
if disposition in ("park", "discard") and not args.force:
    print(f"\033[33m⚠ Disposition is '{disposition}'. Artifact generation runs on "
          f"ideas that passed the Evaluator. Pass --force to proceed anyway.\033[0m")
    sys.exit(0)
```

Add `--force` to argparse. Same `force: true` body field in the web route.

---

### 2c. New stage: `definition`

**Purpose:** Translate market research into product intent. Produces `core_hypothesis` and `personas`. This is the first product-oriented output — derived from research, not from research itself.

**System prompt:**
```
You are a product definition agent. You receive the full output of the Researcher
phase — market brief, competitor matrix, user problem brief, technical feasibility
brief, research synthesis, open questions — plus the original triage and raw idea.

Your job is to produce two definitional artifacts that bridge market research
and product planning:
1. Core hypothesis — what we believe, stated as a testable claim
2. Two personas — who we are building for, grounded in what the research found

These are derived from research, not inventions. Synthesize what the Researcher
found into a clear statement of belief about who this is for and what will be true.

### Core hypothesis
One sentence. Strict format:
"We believe [specific user] experiences [specific problem] when [specific context].
Solving it with [solution approach — not product name] will result in [specific,
measurable outcome]. We will know this is true when [validation signal]."

Rules:
- Validation signal must be a behavior ("users return weekly") not a feeling
  ("users find it valuable")
- Ground the user description in user_problem_brief Part 1, not just triage.who_benefits
- If the market brief revealed a more specific user than triage captured, use that
- Solution approach is at mechanism level ("connecting X to Y") not product name level

### Personas
Exactly 2 personas. Both must be grounded in the research — do not invent a
persona the Researcher did not surface.

Output a JSON array of exactly 2 objects — raw JSON, no code fence:
[{
  "label": "<evocative 3-4 word label — not a job title>",
  "description": "<2 sentences: who they are and what their day looks like>",
  "pain": "<the specific friction this idea addresses for them>",
  "gain": "<what success looks like in their own words — first person>",
  "proxy_for_real_user": <true|false>,
  "research_basis": "<one sentence: which specific research finding supports this persona>"
}]

proxy_for_real_user: true if grounded in a real demand signal from the research
(a forum post, a named user type from the competitor matrix, a specific finding
in the market brief). False if inferred from the problem alone.

research_basis is required on every persona. If no research basis exists,
set proxy_for_real_user to false and state the gap in research_basis.

Behavioral rules:
- Produce exactly 2 personas — no more, no fewer; more is false precision at this stage
- The hypothesis and personas must be internally consistent: the personas are the
  users the hypothesis is about
- If you cannot ground both personas in research, make one grounded and one inferred,
  clearly marked via proxy_for_real_user and research_basis
- Do not reproduce triage.who_benefits verbatim — derive from research
```

**Section map:**
```python
DEFINITION_SECTION_MAP = {
    "Core hypothesis": ("core_hypothesis", "string"),
    "Personas":        ("personas",        "json"),
}
```

**Context builder:**
```python
def build_definition_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    kas = triage.get("kill_assumptions", [])
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Who benefits: {triage.get('who_benefits')}\n"
        f"Kill assumptions:\n"
        + "\n".join(
            f"- {a['text']} [{a.get('status', 'untested')}]"
            if isinstance(a, dict) else f"- {a}"
            for a in kas
        )
        + f"\n\n--- RESEARCHER OUTPUTS ---\n"
        f"Research synthesis:\n{dev.get('research_synthesis', '')}\n\n"
        f"Market brief:\n{dev.get('market_brief', '')}\n\n"
        f"User problem brief:\n{dev.get('user_problem_brief', '')}\n\n"
        f"Competitor matrix:\n{json.dumps(dev.get('competitor_matrix', []), indent=2)}\n\n"
        f"Technical feasibility:\n{dev.get('technical_feasibility_brief', '')}\n\n"
        f"Open questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + "\n\n---\nProduce the core hypothesis and personas now."
    )
```

---

### 2d. New stage: `product_strategy_brief`

**Purpose:** The strategic frame — position, segment, competitive bets, GTM, and why this is the right moment. Reads researcher artifacts + definition outputs.

**System prompt:**
```
You are a product strategist. You receive the Researcher's output (market brief,
competitor matrix, user problem brief, technical feasibility brief) and the
Definition stage output (core hypothesis, personas). Your job is to produce the
strategic frame within which this product will operate.

This is not a market analysis — that came from the Researcher.
This is not a product spec — that comes next in the PRD.
This is the bridge: what position is this product taking, and why will it win?

### Positioning statement
One sentence. The product's unique position in the market relative to competitors.
Strict format: "For [specific user], [product] is the [category] that
[key differentiator], unlike [the alternative they currently use] which
[why that alternative fails them]."
Do not use the product's name — you don't have one yet. Describe it by category.

### Target segment
A paragraph. The most precise possible description of who this is built for first —
not the total addressable market, the beachhead. Where does this idea have the
greatest right to win? Why this segment and not adjacent ones? Cite specific
research findings that support this segment choice.

### Strategic bets
A numbered list, 3 items maximum. Each bet is an assumption about the market,
user behavior, or timing that, if correct, makes this product win.
These are not kill assumptions from triage (which test the idea itself) —
these are bets about the competitive environment.
Format: "We are betting that [specific claim about the world]."
If you cannot identify 3 distinct bets, write fewer — do not pad.

### Competitive differentiation
A paragraph. What this product does that the nearest competitor cannot easily
replicate. Prioritize structural advantages (data network, distribution, timing,
founder insight) over feature differences, which are easily copied.
If no clear structural advantage exists, say so and name it as a risk.

### Go-to-market approach
A paragraph. The specific path to the first 10 users. Not the general strategy —
the exact first move. Who do you contact first, through what channel, with what
specific pitch? This must be concrete enough that someone could execute it tomorrow.

### Why now
A paragraph. What changed in the last 12–18 months that makes this idea viable
now when it might not have been before? Cite specific changes — a technology shift,
regulatory change, behavioral shift, or market gap from a competitor's failure.
If no timing signal was found in the research: write one sentence — "No clear
timing signal was found. This idea's viability does not appear to depend on a
recent change." Do not fabricate urgency.

Behavioral rules:
- Synthesize — do not reproduce researcher artifact text verbatim
- If the research did not support a specific positioning claim, say so rather than
  inventing one
- The positioning statement and target segment must be internally consistent with
  the core hypothesis from the Definition stage
```

**Section map:**
```python
PRODUCT_STRATEGY_SECTION_MAP = {
    "Positioning statement":        ("positioning_statement",       "string"),
    "Target segment":               ("target_segment",              "string"),
    "Strategic bets":               ("strategic_bets",              "list"),
    "Competitive differentiation":  ("competitive_differentiation", "string"),
    "Go-to-market approach":        ("gtm_approach",                "string"),
    "Why now":                      ("why_now",                     "string"),
}
```

**Context builder:**
```python
def build_product_strategy_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Disposition: {triage.get('disposition')}, "
        f"Effort: {triage.get('effort_score')}/5, Impact: {triage.get('impact_score')}/5\n\n"
        f"--- RESEARCHER OUTPUTS ---\n"
        f"Research synthesis:\n{dev.get('research_synthesis', '')}\n\n"
        f"Market brief:\n{dev.get('market_brief', '')}\n\n"
        f"Competitor matrix:\n{json.dumps(dev.get('competitor_matrix', []), indent=2)}\n\n"
        f"User problem brief:\n{dev.get('user_problem_brief', '')}\n\n"
        f"Technical feasibility:\n{dev.get('technical_feasibility_brief', '')}\n\n"
        f"Open questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + f"\n\n--- DEFINITION OUTPUTS ---\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Personas:\n{json.dumps(dev.get('personas', []), indent=2)}\n\n"
        "---\nProduce the product strategy brief now."
    )
```

---

### 2e. Modified stage: `prd`

**What changes:** Replace `### Success metrics` (which produces `prd.success_metrics[]`) with `### Metrics summary` (produces `prd.metrics_summary` string). The full metrics framework is the Metrics Plan artifact.

**PRD section map — updated:**
```python
PRD_SECTION_MAP = {
    "Problem":          ("problem",          "string"),
    "Solution":         ("solution",         "string"),
    "User stories":     ("user_stories",     "list"),
    "Out of scope":     ("out_of_scope",     "list"),
    "Metrics summary":  ("metrics_summary",  "string"),  # replaces success_metrics
    "Constraints":      ("constraints",      "string"),
    "Red flags":        ("red_flags",        "list"),
}
```

**`### Metrics summary` prompt section** (replaces the current `### Success metrics` block in `PRD_SYSTEM`):
```
### Metrics summary
Two sentences maximum. Name the north star metric and the one leading indicator
that would confirm it's moving. Do not list all metrics here — the Metrics Plan
artifact is the right place for the full framework.
Format: "North star: [metric] — [threshold]. Leading signal: [metric] — [threshold]."
If you cannot identify a concrete metric, say so explicitly.
```

**PRD context builder — add product strategy brief to inputs:**
```python
def build_prd_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    strategy = dev.get("product_strategy_brief") or {}
    # ... (existing context) + add:
    + f"--- PRODUCT STRATEGY ---\n"
    + f"Positioning: {strategy.get('positioning_statement', '')}\n"
    + f"Target segment: {strategy.get('target_segment', '')}\n"
    + f"GTM approach: {strategy.get('gtm_approach', '')}\n\n"
    + "---\nProduce the PRD now."
```

**`types.ts` — backward compat:** Keep `success_metrics?: string[]` on `Prd` as optional (old rows like GeoNews have it). Add `metrics_summary?: string`.

---

### 2f. Unchanged stage: `mvp_scope`

Storage key `mvp_scope` is unchanged. Stage system prompt is unchanged. Context builder is unchanged. UI label may say "MVP Definition" in the studio — that is a display-only change, not a code change in the pipeline.

---

### 2g. New stage: `user_journey`

**Purpose:** Map the end-to-end experience of each persona using this product. Journey is not a feature list — it is what the user does, thinks, and feels from first contact to sustained use, including the moments they almost abandon.

**System prompt:**
```
You are a user experience researcher. You receive the full artifact context —
triage, researcher outputs, definition (hypothesis + personas), PRD, and MVP scope.
Your job is to map the end-to-end experience of each persona using this product.

Map 4–6 stages per persona. Cover the full arc: awareness through sustained use.
Do not skip the difficult stages — onboarding friction, moments of confusion,
and near-abandonment are as important as the success moments.

### Journey stages
Output a JSON array in a ```json code fence. One entry per persona-stage combination:
[{
  "persona": "<persona label from Definition stage>",
  "stage": "<stage name: Awareness | Onboarding | First Use | Return Use | Success>",
  "what_they_do": "<the literal action the user takes>",
  "what_they_think": "<one sentence, first person, what is in their head>",
  "what_they_feel": "<emotion word + one sentence explaining the feeling>",
  "success_looks_like": "<observable evidence that this stage went well>",
  "risk": "<the specific reason they would abandon at this stage>"
}]

Use the exact persona labels from the Definition stage. Every persona must have
at least 4 stages.

### Emotion arc
Output a JSON array in a ```json code fence. One object per persona:
[{
  "persona": "<persona label>",
  "arc": [{"stage": "<stage name>", "emotion_level": <1-5>, "note": "<one sentence>"}]
}]
emotion_level scale: 1 = frustrated or lost, 3 = neutral, 5 = delighted.
This reveals where the experience has emotional peaks and valleys.

### Touchpoints
A numbered list. Every interface or interaction point the user encounters,
in sequence. Include empty states, error states, and confirmation messages —
those are touchpoints that builders often skip.

### Drop-off risks
A numbered list. The specific moments where a real user would most likely abandon,
ranked by likelihood. Format: "[Stage name] — [specific reason they leave]"
If a drop-off risk corresponds to an unresolved open question, flag it:
"⚠ This drop-off risk is connected to open question [X] — resolve before launch."

### Jobs to be done
A numbered list. One JTBD per persona per key stage.
Format: "When I [situation], I want to [motivation], so I can [expected outcome]."

Behavioral rules:
- Write what_they_think in authentic first-person — not corporate product voice
- Do not invent stages for features not in the MVP scope's must features
- Do not smooth over drop-off risks. If a stage has a high probability of abandonment,
  name it directly — that is the most valuable output of this artifact
```

**Section map:**
```python
USER_JOURNEY_SECTION_MAP = {
    "Journey stages":  ("journey_stages",   "json"),
    "Emotion arc":     ("emotion_arc",      "json"),
    "Touchpoints":     ("touchpoints",      "list"),
    "Drop-off risks":  ("dropoff_risks",    "list"),
    "Jobs to be done": ("jobs_to_be_done",  "list"),
}
```

**Context builder:**
```python
def build_user_journey_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    prd = dev.get("prd") or {}
    mvp = dev.get("mvp_scope") or {}
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- DEFINITION ---\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Personas:\n{json.dumps(dev.get('personas', []), indent=2)}\n\n"
        f"--- PRD ---\n"
        f"Problem: {prd.get('problem', '')}\n"
        f"Solution: {prd.get('solution', '')}\n"
        f"User stories:\n"
        + "\n".join(f"- {s}" for s in prd.get("user_stories", []))
        + f"\n\nOut of scope:\n"
        + "\n".join(f"- {s}" for s in prd.get("out_of_scope", []))
        + f"\n\n--- MVP SCOPE ---\n"
        f"MVP cut (features):\n{json.dumps(mvp.get('mvp_cut', []), indent=2)}\n\n"
        f"Build sequence:\n"
        + "\n".join(f"- {s}" for s in mvp.get("build_sequence", []))
        + f"\n\nOpen questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + "\n\n---\nProduce the user journey now."
    )
```

---

### 2h. New stage: `metrics_plan`

**Purpose:** The full measurement framework — north star, leading/lagging indicators, instrumentation, cadence, and failure thresholds. The PRD's `metrics_summary` is a pointer to this; this is the substance.

**System prompt:**
```
You are a measurement strategist. You receive the full artifact context — triage,
researcher outputs, definition, PRD, MVP scope, and user journey. Your job is to
produce a complete measurement framework for this MVP.

The PRD has a two-sentence metrics summary. Make it concrete, measurable, and
instrumentable. Every metric you name must be measurable with basic tooling a
solo builder actually has: Supabase queries, Plausible, Mixpanel, or a spreadsheet.

### North star metric
A single sentence. The one metric that best captures whether this product is
delivering its core value to the primary persona.
Format: "[Metric name]: [exact definition of what is counted]. Target: [threshold
with timeframe]. Baseline: [starting value or 'unknown — establish at launch']."

### Leading indicators
Output a JSON array in a ```json code fence:
[{
  "metric": "<metric name>",
  "definition": "<exactly what is counted and how — no ambiguity>",
  "target_threshold": "<number + timeframe that signals health>",
  "measurement_method": "<specific Supabase query, event name, or manual method>"
}]
3 items maximum. Leading indicators move before the north star — they confirm
you are on track before the outcome metric settles. If you cannot identify 3
distinct leading indicators, write fewer.

### Lagging indicators
Same format as leading indicators. 3 items maximum. These are outcome metrics —
they move after value is delivered. The north star metric should appear here as
the primary item.

### Instrumentation required
A numbered list. The specific events, properties, or data captures the product
must emit for these metrics to be measurable.
Format: "[Event or data point] — needed for [which metric(s)]"
If any metric cannot be measured without instrumentation not in the MVP scope,
flag it: "⚠ [Metric] requires [specific instrumentation] which is not in the MVP
cut. Either add it or drop the metric."

### Measurement cadence
A single paragraph. How often each metric is checked, what triggers an off-cycle
review, and what the specific response is if a failure threshold is hit.
Be concrete about the off-cycle trigger — not "if things look bad" but "if
day-7 retention drops below X%."

### Failure thresholds
A numbered list. The specific values that trigger a stop-and-reassess — not
a tweak, a genuine strategic reconsideration.
Format: "If [metric] is [value] after [timeframe], [specific action]."
These are circuit breakers. Each one should have a concrete action attached,
not just "revisit scope."

Behavioral rules:
- Each metric must have a target threshold with a rationale — "70% because [reason]"
  not just "70%"
- For every untested kill assumption from triage, add a metric that would test it:
  "⚠ Kill assumption '[X]' is untested. Metric to resolve it: [specific metric]."
- Do not propose metrics that cannot be measured with the instrumentation listed.
  An unmeasurable metric is worse than no metric — it creates false confidence.
```

**Section map:**
```python
METRICS_PLAN_SECTION_MAP = {
    "North star metric":        ("north_star_metric",       "string"),
    "Leading indicators":       ("leading_indicators",       "json"),
    "Lagging indicators":       ("lagging_indicators",       "json"),
    "Instrumentation required": ("instrumentation_required", "list"),
    "Measurement cadence":      ("measurement_cadence",      "string"),
    "Failure thresholds":       ("failure_thresholds",       "list"),
}
```

**Context builder:**
```python
def build_metrics_plan_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    prd = dev.get("prd") or {}
    mvp = dev.get("mvp_scope") or {}
    kas = triage.get("kill_assumptions", [])
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Kill assumptions:\n"
        + "\n".join(
            f"- {a['text']} [{a.get('status', 'untested')}]"
            if isinstance(a, dict) else f"- {a}"
            for a in kas
        )
        + f"\n\n--- DEFINITION ---\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Personas:\n{json.dumps(dev.get('personas', []), indent=2)}\n\n"
        f"--- PRD ---\n"
        f"Metrics summary: {prd.get('metrics_summary', '')}\n"
        f"Solution: {prd.get('solution', '')}\n"
        f"Success criteria from user stories:\n"
        + "\n".join(f"- {s}" for s in prd.get("user_stories", []))
        + f"\n\n--- MVP SCOPE ---\n"
        f"MVP cut (features):\n{json.dumps(mvp.get('mvp_cut', []), indent=2)}\n\n"
        "---\nProduce the metrics plan now."
    )
```

---

### 2i. Updated prerequisite map

```python
DEPS = {
    "definition":              [],
    "product_strategy_brief":  [("definition", "development.core_hypothesis")],
    "prd":                     [("definition",             "development.core_hypothesis"),
                                ("product_strategy_brief", "development.product_strategy_brief")],
    "mvp_scope":               [("prd", "development.prd")],
    "user_journey":            [("prd",       "development.prd"),
                                ("mvp_scope", "development.mvp_scope")],
    "metrics_plan":            [("prd",       "development.prd"),
                                ("mvp_scope", "development.mvp_scope")],
    # Soft-deprecated
    "next_steps":              [("prd",       "development.prd"),
                                ("mvp_scope", "development.mvp_scope")],
    "builder_brief":           [("prd",       "development.prd"),
                                ("mvp_scope", "development.mvp_scope"),
                                ("next_steps","development.next_steps")],
}
```

---

### 2j. `save_artifact` — multi-key Definition stage

**The problem:** `save_artifact` takes a single `dev_key` and writes `{dev_key: parsed_dict}` into `development`. For the Definition stage this would produce `development.definition = {"core_hypothesis": ..., "personas": [...]}` — a nested sub-object. But `core_hypothesis` and `personas` must be **top-level** keys in `development`, because that is where `distill.py`, `build_mvp_context`, and `build_product_strategy_context` all read them.

**Fix — Python (`artifacts.py`):**

Add a `flat` parameter to `save_artifact`:

```python
def save_artifact(
    idea_id: str,
    dev_key: str | None,
    value: dict,
    current_dev: dict,
) -> dict:
    """
    Merge value into ideas.development and write to Supabase.
    If dev_key is None, spreads value directly at the top level of development
    (used by stages that produce multiple top-level keys, e.g. 'definition').
    If dev_key is a string, nests value under that key.
    Returns the updated development dict.
    """
    db = get_client()
    if dev_key is None:
        updated_dev = {**current_dev, **value}
    else:
        updated_dev = {**current_dev, dev_key: value}
    db.table("ideas").update({"development": updated_dev}).eq("id", idea_id).execute()
    return updated_dev
```

In `main()`, the call site becomes:

```python
# Stages that spread multiple keys at the top level of development
FLAT_STAGES = {"definition"}

# ...inside the stage loop:
key = None if stage in FLAT_STAGES else stage
if args.dry_run:
    if stage in FLAT_STAGES:
        current_dev = {**current_dev, **parsed}
    else:
        current_dev = {**current_dev, stage: parsed}
else:
    current_dev = save_artifact(args.idea_id, key, parsed, current_dev)
```

**Fix — TypeScript (`/api/artifacts/route.ts`):**

```typescript
const FLAT_STAGES = new Set(["definition"]);

// ...inside the stage loop, replacing the existing updatedDev line:
const updatedDev = FLAT_STAGES.has(stage)
  ? { ...currentDev, ...parsed }
  : { ...currentDev, [stage]: parsed };
```

**Consequence for distill.py:** `core_hypothesis` and `personas` land at the correct top-level position and remain readable by `distill.py` without any change to that file. See section 6a for the full audit.

---

### 2k. Artifact versioning (same pattern as Researcher)

Before writing a new artifact run, snapshot the existing artifact keys:

```python
# Note: "definition" is NOT in ARTIFACT_KEYS because it is not a top-level storage key.
# Its outputs (core_hypothesis, personas) are captured directly.
ARTIFACT_KEYS = [
    "core_hypothesis", "personas",          # from definition stage (top-level)
    "product_strategy_brief", "prd",
    "mvp_scope", "user_journey", "metrics_plan",
]
# Snapshot before the write (inside save_artifact or before calling it):
existing_dev = current_dev
history = existing_dev.get("artifacts_history", [])
snapshot = {k: existing_dev[k] for k in ARTIFACT_KEYS if k in existing_dev}
if snapshot:
    history.append({"snapshotted_at": now, **snapshot})
```

No new Supabase column needed — `artifacts_history` is a key inside the existing `development` JSONB.

---

## 3. Auth additions

### 3a. `/api/sharpen/route.ts`

Add at the top of the route handler, before the idea fetch:

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
}
```

### 3b. `/api/artifacts/route.ts`

Same block, same position.

---

## 4. `types.ts` changes

### 4a. `Persona` — add `research_basis`

```typescript
export interface Persona {
  label: string;
  description: string;
  pain: string;
  gain: string;
  proxy_for_real_user?: boolean;
  research_basis?: string;  // which research finding grounds this persona
}
```

### 4b. `Prd` — replace `success_metrics` with `metrics_summary`

```typescript
export interface Prd {
  problem?: string;
  solution: string;
  user_stories: string[];
  out_of_scope: string[];
  success_metrics?: string[];  // deprecated — kept for old rows; absent in new runs
  metrics_summary?: string;    // new — replaces success_metrics
  constraints?: string;
  red_flags?: string[];
}
```

### 4c. New interfaces

```typescript
export interface CompetitorEntry {
  name: string;
  category: string;
  positioning: string;
  key_gap: string;
}

export interface ProductStrategyBrief {
  positioning_statement?: string;
  target_segment?: string;
  strategic_bets?: string[];
  competitive_differentiation?: string;
  gtm_approach?: string;
  why_now?: string;
}

export interface JourneyStage {
  persona: string;
  stage: string;
  what_they_do: string;
  what_they_think: string;
  what_they_feel: string;
  success_looks_like: string;
  risk: string;
}

export interface EmotionArcEntry {
  stage: string;
  emotion_level: 1 | 2 | 3 | 4 | 5;
  note: string;
}

export interface UserJourney {
  journey_stages?: JourneyStage[];
  emotion_arc?: { persona: string; arc: EmotionArcEntry[] }[];
  touchpoints?: string[];
  dropoff_risks?: string[];
  jobs_to_be_done?: string[];
}

export interface MetricDefinition {
  metric: string;
  definition: string;
  target_threshold: string;
  measurement_method: string;
}

export interface MetricsPlan {
  north_star_metric?: string;
  leading_indicators?: MetricDefinition[];
  lagging_indicators?: MetricDefinition[];
  instrumentation_required?: string[];
  measurement_cadence?: string;
  failure_thresholds?: string[];
}
```

### 4d. `Development` interface — full replacement

```typescript
export interface Development {
  // ── Researcher outputs ────────────────────────────────────────────────────
  research_synthesis?: string;
  market_brief?: string;
  competitor_matrix?: CompetitorEntry[];
  user_problem_brief?: string;
  technical_feasibility_brief?: string;
  open_questions?: string[];
  sharpened_at?: string;

  // Backward-compat aliases — written automatically; do not write manually
  competitive_landscape?: string;  // auto-derived from competitor_matrix[0]
  problem_statement?: string;      // auto-extracted from user_problem_brief Part 2

  // ── Artifact Creator: Definition stage ───────────────────────────────────
  core_hypothesis?: string;
  personas?: Persona[];

  // ── Artifact Creator: Strategy stage ─────────────────────────────────────
  product_strategy_brief?: ProductStrategyBrief;

  // ── Artifact Creator: PRD ─────────────────────────────────────────────────
  prd?: Prd;

  // ── Artifact Creator: MVP ─────────────────────────────────────────────────
  mvp_scope?: MvpScope;  // storage key unchanged; studio labels this "MVP Definition"

  // ── Artifact Creator: Journey ─────────────────────────────────────────────
  user_journey?: UserJourney;

  // ── Artifact Creator: Metrics ─────────────────────────────────────────────
  metrics_plan?: MetricsPlan;

  // ── Soft-deprecated ───────────────────────────────────────────────────────
  next_steps?: NextSteps;   // not produced by default pipeline; still runnable via --from
  builder_brief?: unknown;  // not produced by default pipeline; still runnable via --from

  // ── Version history (internal) ───────────────────────────────────────────
  sharpening_history?: unknown[];
  artifacts_history?: unknown[];
}
```

### 4e. No change to `ArtifactType`

`ArtifactType = "brief" | "synthesis" | "prd" | "directions"` is used by the portfolio rendering system's `artifact_explorer` archetype — it is independent of the development artifact naming. Leave it alone.

---

## 5. Validation additions

Add required-key validation in both Python (post-parse) and TypeScript (in route, before write). These are warnings, not hard failures — log and continue.

```python
# sharpen.py — after parse_output()
REQUIRED_RESEARCHER_KEYS = [
    "research_synthesis", "market_brief", "competitor_matrix",
    "user_problem_brief", "technical_feasibility_brief", "open_questions",
]
missing = [k for k in REQUIRED_RESEARCHER_KEYS
           if not development.get(k) or development[k] in ("", [], {})]
if missing:
    print(f"\033[33m⚠ Missing or empty researcher keys: {missing}\033[0m")
```

```python
# artifacts.py — after parse_artifact()
REQUIRED_KEYS_BY_STAGE = {
    "definition":             ["core_hypothesis", "personas"],
    "product_strategy_brief": ["positioning_statement", "target_segment", "why_now"],
    "prd":                    ["solution", "user_stories", "metrics_summary"],
    "mvp_scope":              ["mvp_cut", "build_sequence"],
    "user_journey":           ["journey_stages", "dropoff_risks"],
    "metrics_plan":           ["north_star_metric", "leading_indicators"],
}
missing = [k for k in REQUIRED_KEYS_BY_STAGE.get(stage, [])
           if not parsed.get(k) or parsed[k] in ("", [], {})]
if missing:
    print(f"\033[33m⚠ Stage '{stage}' — missing or empty keys: {missing}\033[0m")
```

---

## 6. Supabase schema changes

Only one column is needed:

```sql
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS sharpened_version INTEGER DEFAULT 0;
```

All other storage uses the existing `development` JSONB column with new keys. No column renames, no row migrations, no changes to existing rows.

---

## 6a. `distill.py` key audit

`distill.py` reads `ideas.development` in two functions: `_build_idea_context()` and `_build_artifact_inventory()`. It also has a gate check in `distill_idea()`. Every key it references is audited here against the post-migration state.

| Key read by `distill.py` | Where read | After migration | Safe? | Reason |
|---|---|---|---|---|
| `problem_statement` | `_build_idea_context` line 456, `_build_artifact_inventory` line 497, `distill_idea` gate line 640 | Written as backward-compat alias extracted from `user_problem_brief` Part 2 | ✅ | Section 1f writes this explicitly on every new Researcher run |
| `core_hypothesis` | `_build_idea_context` line 460 | Written to top-level `development` by Definition stage — **only if** the `save_artifact` flat-merge fix (section 2j) is applied | ✅ with fix | Without the fix: `distill.py` would read empty string; persona and hypothesis context would be lost from all distillation runs on new ideas |
| `competitive_landscape` | `_build_idea_context` line 461, `_build_artifact_inventory` line 503 | Written as backward-compat alias derived from `competitor_matrix[0]` | ✅ | Section 1f writes this explicitly on every new Researcher run |
| `open_questions` | `_build_idea_context` line 464 | Still written directly by Researcher | ✅ | Unchanged output key |
| `personas` | `_build_idea_context` line 467, `_build_artifact_inventory` line 505 | Written to top-level `development` by Definition stage — **only if** the `save_artifact` flat-merge fix (section 2j) is applied | ✅ with fix | Same risk as `core_hypothesis` above |
| `research_synthesis` | `_build_artifact_inventory` line 501 | Still written directly by Researcher | ✅ | Unchanged output key |
| `prd` | `_build_idea_context` line 479, `_build_artifact_inventory` line 509 | Still written by Artifact Creator as `development.prd` | ✅ | Unchanged storage key; `prd.success_metrics` → `prd.metrics_summary` change does not affect distill.py (it does not read `success_metrics`) |
| `mvp_scope` | `_build_artifact_inventory` line 511 | Storage key unchanged | ✅ | Unchanged |
| `next_steps` | `_build_artifact_inventory` line 513 | Still runnable via `--from`; existing rows retain the key | ✅ | Soft-deprecated, not deleted; old rows untouched |
| `builder_brief` | `_build_idea_context` line 481, `_build_artifact_inventory` line 515 | Still runnable via `--from`; existing rows retain the key | ✅ | Same as `next_steps` |

**Summary:** No changes to `distill.py` are required as part of this migration. The two keys whose safety depends on a fix elsewhere (`core_hypothesis`, `personas`) are both covered by the `save_artifact` flat-merge change in section 2j. If that fix is skipped, distillation on any new idea will silently lose hypothesis and persona context. Run the section 2j fix before testing distillation on any newly-processed idea.

---

## 7. Safe migration order

**GeoNews invariant:** The public page at `/projects/[slug]` renders `ideas.portfolio` data only. Distillation (`distill.py`) reads `ideas.development` but only when explicitly run. No migration step triggers a distillation re-run on GeoNews. The GeoNews row will not be touched unless you manually run a pipeline step on it.

### Step 0 — Snapshot GeoNews (before any code changes)

```python
# Run once; save output locally as geonews-snapshot.json
import json
from db import get_client
db = get_client()
geonews_id = "<the GeoNews idea_id>"
result = db.table("ideas").select("id, state, triage, development, portfolio").eq("id", geonews_id).single().execute()
with open("geonews-snapshot.json", "w") as f:
    json.dump(result.data, f, indent=2)
print("Snapshot saved.")
```

After: verify the public GeoNews page loads. If it doesn't load now, fix that before doing anything else.

### Step 1 — `types.ts` (zero runtime risk)

Add new interfaces and update `Development`, `Prd`, `Persona`. No runtime effect — TypeScript only. Verify studio compiles without errors.

### Step 2 — Supabase column

```sql
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS sharpened_version INTEGER DEFAULT 0;
```

Run in Supabase SQL editor. Verify in Table Editor that the column appears on the `ideas` table with default 0.

### Step 3 — `sharpen.py` (Python CLI only)

Do this before touching `route.ts` — test with the CLI on a non-GeoNews idea.

Changes in order:
1. Replace `SECTION_MAP`
2. Replace `SYSTEM_PROMPT`
3. Add `competitor_matrix` JSON parsing branch
4. Add disposition gate with `--force`
5. Add backward-compat alias writes (`competitive_landscape`, `problem_statement`)
6. Add required-key validation
7. Add `sharpening_history` snapshot
8. Update the `sharpened_version` increment

Test: `python sharpen.py --idea-id <non_geonews_id> --dry-run` (add `--dry-run` to `sharpen.py` if not present).

Verify the following after the test run:
- All 6 researcher keys are present and non-empty in the parsed output
- `competitive_landscape` alias is populated
- `problem_statement` is extracted and non-empty
- GeoNews public page still loads
- GeoNews in studio detail still shows old sharpening data

### Step 4 — `/api/sharpen/route.ts`

Mirror all Step 3 changes in the web route:
1. Update `SECTION_MAP`
2. Update `SYSTEM_PROMPT`
3. Add `competitor_matrix` JSON parsing branch
4. Add auth check
5. Add disposition gate with `force` body parameter
6. Add backward-compat alias writes
7. Add required-key validation

Test: trigger sharpening from the studio on a non-GeoNews idea. Verify SSE events arrive correctly and the development object is written.

### Step 5 — `artifacts.py` (Python CLI only)

Do this before touching `/api/artifacts`.

Changes in order:
1. Add new system prompts (`DEFINITION_SYSTEM`, `PRODUCT_STRATEGY_SYSTEM`, `USER_JOURNEY_SYSTEM`, `METRICS_PLAN_SYSTEM`)
2. Add new section maps
3. Add new context builders
4. Add `definition` and `product_strategy_brief` to `STAGES` (before `prd`)
5. Add `user_journey` and `metrics_plan` to `STAGES` (after `mvp_scope`)
6. Remove `next_steps` and `builder_brief` from default `STAGES`; add them to `DEPRECATED_STAGES`
7. Update `ALL_STAGES = STAGES + DEPRECATED_STAGES`
8. Update `STAGE_LABELS` for all new stages
9. Update `MAX_TOKENS` for all new stages
10. Update prerequisite map (`DEPS`)
11. Update the pre-flight check (`user_problem_brief` || `problem_statement`)
12. Add disposition gate with `--force`
13. Add required-key validation per stage
14. Add `artifacts_history` snapshot
15. Update `--from` to accept `ALL_STAGES`

Test: `python artifacts.py <non_geonews_id> --dry-run` (full chain).
Then: `python artifacts.py <non_geonews_id> --from next_steps --dry-run` (verify deprecated stages still run).

Verify:
- All 6 default stages run in order
- Each stage's parsed output has all required keys
- `next_steps` and `builder_brief` do NOT run in the default chain
- `--from next_steps` runs them with the deprecation warning
- GeoNews public page still loads

### Step 6 — `/api/artifacts/route.ts`

Mirror all Step 5 changes in the web route. Add auth check. Add disposition gate.

Test: trigger artifact generation from the studio on a non-GeoNews idea. Verify all 6 stages stream progress events and write to Supabase.

### Step 7 — Studio UI (ArtifactPanel, display components)

Add display panels for the 4 new artifact types: `product_strategy_brief`, `user_journey`, `metrics_plan`, and the Definition outputs (`core_hypothesis`, `personas`).

This is additive — new tabs or sections in the artifact panel. Do not remove old panels for `next_steps` or `builder_brief`; they remain readable from old rows.

### Step 8 — Full regression

1. Load the GeoNews public page. Verify all portfolio sections render.
2. Click the GeoNews chatbot. Send a test message. Verify a response arrives.
3. Open GeoNews in the studio. Verify the old sharpening and artifact data is visible.
4. Compare the studio display against `geonews-snapshot.json` to confirm no data loss.
5. Run a fresh idea through the full pipeline: triage → sharpen → artifacts (all 6 default stages).
6. Verify the new artifacts produce valid, non-empty output.
7. Verify that running sharpen on a `park` idea without `--force` returns the gate message.

---

*End of spec.*
