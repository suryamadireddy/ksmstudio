#!/usr/bin/env python3
"""
artifacts.py — Artifact Generation

Takes an idea_id, chains four prompts in sequence (PRD → MVP scope →
next steps → builder brief), streams each to the terminal, parses the
structured output, and writes JSON objects to ideas.development in Supabase.

Each artifact is written to Supabase as it completes (fail-safe).

Usage:
    python artifacts.py <idea_id>
    python artifacts.py <idea_id> --from mvp_scope
    python artifacts.py <idea_id> --dry-run

Flags:
    --from <stage>   Start pipeline from this stage (skips earlier ones)
    --dry-run        Call Claude, parse output, print JSON — but do not write
                     to Supabase. Use this to verify structure before saving.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from typing import Union

import anthropic

from config import ANTHROPIC_API_KEY, MODEL
from db import get_client

# ── Stage ordering ────────────────────────────────────────────────────────────

STAGES = ["prd", "mvp_scope", "next_steps", "builder_brief"]

STAGE_LABELS = {
    "prd":           "PRD",
    "mvp_scope":     "MVP Scope",
    "next_steps":    "Next Steps",
    "builder_brief": "Builder Brief",
}

# ── System prompts ────────────────────────────────────────────────────────────

PRD_SYSTEM = """\
You are a product requirements writer. You receive the full context from the
triage and sharpening stages. Your job is to produce a PRD that is honest,
minimal, and immediately actionable — not a document that looks thorough
but isn't.

What a good PRD does at this stage:
It answers one question for a builder: "What exactly am I building, for whom,
and how will I know it worked?" Nothing more.

It does not:
- Speculate about future versions
- List every possible feature
- Use filler language like "seamless," "intuitive," or "robust"
- Pretend you have certainty you don't have

Output structure — use these exact headings:

### Problem
Copy the problem statement from sharpening verbatim. Do not rewrite it.
If it needs changing, flag it and stop.

### Solution
2–3 sentences. What this product does, stated plainly. Start with the verb:
"A tool that...", "A system that...", "An interface that..."
No product names, no marketing language.

### User stories
Numbered list. Generate user stories in strict format:
"As a [persona label], I want to [specific action] so that [specific outcome]."

Rules:
- One story per core capability only — no edge cases at this stage
- Maximum 6 stories total
- The action must be something a user literally does, not something they feel
- The outcome must be measurable or observable
- Derive stories directly from persona pain and gain fields — do not invent
  new jobs-to-be-done that weren't surfaced in sharpening

### Out of scope
Numbered list. 4–6 things this MVP explicitly does not do.

Rules:
- Each item must be something a reasonable person would expect this product to do
- State why it's out of scope in 5 words or fewer
- Format: "[Feature or capability] — [reason]"

### Success metrics
Numbered list. 3 metrics maximum. Each must be:
- Tied directly to the validation signal in the core hypothesis
- Measurable without instrumentation you don't have yet
- Expressed as a threshold: "70% of users return within 7 days" not "retention improves"

### Constraints
A single paragraph covering real constraints only — things that will actually
shape what gets built. Address: Technical, Time, Data, Dependencies.
Do not use a list — write it as connected prose.

### Red flags
Numbered list. Product risks or assumptions that could invalidate this PRD if wrong.
Each item: one sentence, one specific risk.

Behavioral rules:
- If open questions could materially change user stories or success metrics,
  flag at the top: "⚠ Open question [X] is unresolved and may invalidate
  [specific section]. Consider resolving before building."
- Do not generate stories for personas marked proxy_for_real_user: false
  without flagging: "(unvalidated persona — treat this story as a hypothesis)"
- If you cannot derive a measurable success metric, say so explicitly.\
"""

PRD_SECTION_MAP = {
    "Problem":         ("problem",         "string"),
    "Solution":        ("solution",         "string"),
    "User stories":    ("user_stories",     "list"),
    "Out of scope":    ("out_of_scope",     "list"),
    "Success metrics": ("success_metrics",  "list"),
    "Constraints":     ("constraints",      "string"),
    "Red flags":       ("red_flags",        "list"),
}

# ─────────────────────────────────────────────────────────────────────────────

MVP_SYSTEM = """\
You are an MVP scoping agent. You receive the full context from triage,
sharpening, and the completed PRD. Your job is to produce the minimum
feature set that proves the core hypothesis — nothing more.

The scoping principle:
An MVP is not a small version of the full product. It is the smallest thing
that can return a definitive answer to the core hypothesis.

Every feature you include must pass this test:
"If I removed this, could I still prove or disprove the core hypothesis?"
If yes — cut it.

Step 1: Feature extraction
Read the PRD user stories. For each story, generate a candidate feature.

Candidate feature format:
{
  "name": "<short label>",
  "description": "<what it does in one sentence>",
  "story_ref": "<the user story it serves>",
  "hypothesis_link": "<which part of the core hypothesis this proves>",
  "effort": "<small|medium|large>",
  "priority": "<must|should|could|wont>"
}

Effort definitions (for a solo builder):
- small: hours to 1 day
- medium: 2–5 days
- large: 1–3 weeks

Priority definitions:
- must: MVP fails without this — hypothesis cannot be tested
- should: meaningfully improves the test but isn't blocking
- could: nice to have, only if must+should are complete ahead of schedule
- wont: explicitly out of scope for this MVP

Step 2: The cut
MVP = all must features + any should features with effort ≤ medium.
Deferred = all wont features plus any could/should features not included.

Step 3: Build sequence
Order must features by dependency, not importance.

Output format — use these exact headings:

### Features
Output the full candidate feature list as a JSON array in a ```json code fence.
Each element follows the candidate feature format above.

### MVP cut
Output only the must + qualifying should features as a JSON array in a ```json
code fence. Same format as Features — each element has name, description,
story_ref, hypothesis_link, effort, priority.

### Deferred
Output features explicitly pushed to later versions as a JSON array in a
```json code fence. Each element: {"name": "...", "reason": "..."}

### Build sequence
Numbered list. Order to build MVP features.
Format: "[Feature name] — [dependency note or 'no dependencies']"

### Effort estimate
A single paragraph. Total estimate for must features, then for must + qualifying
should. Include confidence range and identify the highest-uncertainty item.

### Scope risk flags
Numbered list. Features where the effort estimate is uncertain or where
scoping decisions carry risk. One item per risk.

Behavioral rules:
- If all must features are large-effort, flag it and suggest paper prototype
- Do not suggest features not in the PRD
- Flag circular dependencies explicitly — they require architecture rethinking\
"""

MVP_SECTION_MAP = {
    "Features":         ("features",        "json"),
    "MVP cut":          ("mvp_cut",         "json"),
    "Deferred":         ("deferred",        "json"),
    "Build sequence":   ("build_sequence",  "list"),
    "Effort estimate":  ("effort_estimate", "string"),
    "Scope risk flags": ("scope_risk_flags","list"),
}

# ─────────────────────────────────────────────────────────────────────────────

NEXT_STEPS_SYSTEM = """\
You are a planning agent. You receive the full artifact context — triage,
sharpening, PRD, and MVP scope. Your job is to produce a concrete, sequenced
action plan that bridges the gap between "artifacts complete" and
"first working version deployed."

This is a personal action list for a solo builder — specific, ordered,
and honest about what comes before what. Not a project plan with milestones.

Step 1: Resolve open questions first
For each high-directional-impact open question, generate a resolution action
before any build actions.

Resolution action format:
{
  "action": "<specific thing to do>",
  "type": "resolve",
  "question_addressed": "<the open question>",
  "method": "<how to get the answer>",
  "by_when": "<before build starts|during sprint 1|before sprint 2>",
  "owner": "me",
  "blocks": "<what build action this unblocks>"
}

Step 2: Build actions
Convert the MVP build sequence into discrete actions.

Build action format:
{
  "action": "<specific thing to build or configure>",
  "type": "build",
  "depends_on": "<prior action number or null>",
  "effort": "<from MVP scope>",
  "owner": "me",
  "definition_of_done": "<observable completion criterion — not subjective>"
}

Definition of done rules:
- Must be observable by someone other than you
- No subjective language: no "working well," "feels right," "mostly done"

Step 3: Validation actions
2–3 actions to test whether the MVP proves the core hypothesis.

Validation action format:
{
  "action": "<specific test or observation>",
  "type": "validate",
  "metric_ref": "<which PRD success metric this tests>",
  "method": "<how you will run the test>",
  "depends_on": "<build action number>",
  "success_looks_like": "<the PRD metric threshold>",
  "failure_looks_like": "<what you will do if the test fails>"
}

Output format — use these exact headings:

### Resolution actions
Output as a JSON array in a ```json code fence. Each element follows the
resolution action format above.

### Build actions
Output as a JSON array in a ```json code fence, in dependency order.
Each element follows the build action format above.

### Validation actions
Output as a JSON array in a ```json code fence.
Each element follows the validation action format above.

### Critical path
A single paragraph. The shortest sequence of steps where delay delays everything
else. Be specific about dependencies. Blocking actions only.

### First action
A single sentence. The one thing to do in the next 24 hours.
So specific there is no ambiguity about whether it was done.

Behavioral rules:
- First action must always be a resolution action if high-directional-impact
  open questions remain unresolved
- If critical path effort exceeds triage effort score by more than one level,
  flag it: "⚠ Effort creep detected: triage estimated [X], critical path
  suggests [Y]. Revisit scope."
- Definition of done for every build action must connect to at least one
  PRD success metric. If it doesn't, the feature may not belong in the MVP.\
"""

NEXT_SECTION_MAP = {
    "Resolution actions": ("resolution_actions", "json"),
    "Build actions":      ("build_actions",      "json"),
    "Validation actions": ("validation_actions", "json"),
    "Critical path":      ("critical_path",      "string"),
    "First action":       ("first_action",       "string"),
}

# ─────────────────────────────────────────────────────────────────────────────

BUILDER_BRIEF_SYSTEM = """\
You are a builder brief agent. You receive the full artifact context —
triage, sharpening, PRD, MVP scope, and next steps. Your job is to compile
everything into a single structured document that an AI builder (Lovable,
v0, or Claude Code) can consume directly to scaffold a working MVP with
no additional context required.

A builder brief is not a summary. It is a translation — taking analytical
artifacts and converting them into the language a builder needs: interfaces,
behaviors, data shapes, and acceptance criteria. A good builder brief means
the AI builder never has to guess.

Output format — use these exact headings:

### Stack
Output a JSON object in a ```json code fence with this exact shape:
{
  "frontend": "<framework — default to Next.js unless constraints say otherwise>",
  "backend": "<API approach — Next.js API routes, FastAPI, or none if frontend-only>",
  "database": "Supabase",
  "auth": "<Supabase Auth, or none if auth is not a must feature>",
  "hosting": "<Vercel for Next.js, or specify alternative>",
  "key_libraries": ["<library>: <what it does in this project>"],
  "explicitly_excluded": ["<technology>: <why not>"]
}
Rules: default to simplest stack that proves the hypothesis. Do not add a
layer not required by a must feature. Flag skill gaps inline.

### Application map
Output as a JSON array in a ```json code fence. One object per screen,
must features only:
{
  "name": "<screen name>",
  "route": "<URL path>",
  "purpose": "<one sentence>",
  "triggered_by": "<what brings the user here>",
  "primary_action": "<the single most important thing the user does here>",
  "components": [{"name": "", "type": "", "behavior": "", "data_source": ""}],
  "success_state": "<what the user sees when primary action completes>",
  "empty_state": "<what the user sees before any data exists>",
  "error_state": "<what the user sees if something fails>"
}
Always specify all three states — builders generate only the happy path by default.
If must features require more than 5 screens, flag scope creep.

### Data model
Output as a JSON array in a ```json code fence. One object per table,
must features only:
{
  "table": "<name>",
  "purpose": "<one sentence>",
  "fields": [{"name": "", "type": "", "required": true, "notes": ""}],
  "rls_rule": "<who can read and write>"
}
If must features require more than 4 tables, flag it.

### API map
Output as a JSON array in a ```json code fence. Every external call the MVP makes:
{
  "name": "", "purpose": "", "called_from": "",
  "input": "", "output": "", "error_handling": "", "env_var": ""
}

### Acceptance criteria
Numbered list. For every must feature, Given/When/Then format:
"[Feature name]: Given [state] / When [action] / Then [observable outcome] / But not [failure mode]"

"But not" is mandatory — it names the most likely failure mode.
If a must feature cannot be described with a complete criterion because behavior
is still ambiguous, write: "⚠ [Feature] — behavior undefined. Resolve before builder."

### Builder prompt
A single paragraph written directly to the developer. Summarise what to build,
the most important architectural decisions, the biggest technical risks, and any
non-obvious implementation notes. Write it as if handing this to a contractor.
Do not reference other artifacts — this paragraph must stand alone.

Behavioral rules:
- The builder prompt section must be self-contained. No references to other
  artifacts. Operational only, no strategic framing.
- Do not add screens, tables, or integrations not required by must features.\
"""

BUILDER_SECTION_MAP = {
    "Stack":               ("stack",               "json"),
    "Application map":     ("application_map",     "json"),
    "Data model":          ("data_model",           "json"),
    "API map":             ("api_map",              "json"),
    "Acceptance criteria": ("acceptance_criteria",  "list"),
    "Builder prompt":      ("builder_prompt",       "string"),
}

# ── Section maps index ────────────────────────────────────────────────────────

SYSTEM_PROMPTS = {
    "prd":           PRD_SYSTEM,
    "mvp_scope":     MVP_SYSTEM,
    "next_steps":    NEXT_STEPS_SYSTEM,
    "builder_brief": BUILDER_BRIEF_SYSTEM,
}

SECTION_MAPS = {
    "prd":           PRD_SECTION_MAP,
    "mvp_scope":     MVP_SECTION_MAP,
    "next_steps":    NEXT_SECTION_MAP,
    "builder_brief": BUILDER_SECTION_MAP,
}

# ── Parser ────────────────────────────────────────────────────────────────────

def _extract_sections(text: str, headings: list[str]) -> dict[str, str]:
    """
    Position-based section extractor. Finds each heading's position in the
    text and slices out the content before the next heading starts.
    Robust to leading/trailing whitespace and line endings around headings.
    """
    positions: list[tuple[int, str]] = []
    for heading in headings:
        m = re.search(r"###\s+" + re.escape(heading), text, re.IGNORECASE)
        if m:
            positions.append((m.end(), heading))

    positions.sort(key=lambda x: x[0])

    sections: dict[str, str] = {}
    for i, (content_start, heading) in enumerate(positions):
        if i + 1 < len(positions):
            next_start = positions[i + 1][0]
            # Walk back from the next heading's content start to find its ###
            marker = text.rfind("###", content_start, next_start)
            content_end = marker if marker != -1 else next_start
        else:
            content_end = len(text)
        sections[heading] = text[content_start:content_end].strip()

    return sections


def _parse_field(content: str, field_type: str) -> Union[str, list, dict]:
    """
    Parse section content according to its declared type.

    field_type:
      "string" — return raw text as-is
      "list"   — extract numbered or bulleted list items
      "json"   — extract JSON from a code fence (sharpen.py personas approach);
                 if no fence, attempt to parse raw content; never splits on newlines
    """
    if field_type == "string":
        return content

    if field_type == "json":
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
        json_text = fenced.group(1).strip() if fenced else content
        # Strip // line comments (Claude sometimes adds them)
        json_text = re.sub(r"//[^\n]*", "", json_text)
        try:
            return json.loads(json_text)
        except json.JSONDecodeError as exc:
            print(f"\033[33m  ⚠ JSON parse failed: {exc}\033[0m")
            return json_text  # preserve raw so data isn't silently lost

    # "list": try numbered list, then bullets, then line-split
    numbered = re.findall(r"^\d+\.\s+(.+)$", content, re.MULTILINE)
    if numbered:
        return numbered

    bulleted = re.findall(r"^[-*•]\s+(.+)$", content, re.MULTILINE)
    if bulleted:
        return bulleted

    return [line.strip() for line in content.splitlines() if line.strip()]


def parse_artifact(text: str, section_map: dict[str, tuple[str, str]]) -> dict:
    """
    Parse Claude's response into a structured dict.

    section_map: {heading: (json_key, field_type)}
    Returns: {json_key: parsed_value}
    """
    headings = list(section_map.keys())
    raw_sections = _extract_sections(text, headings)

    result: dict = {}
    for heading, (key, field_type) in section_map.items():
        content = raw_sections.get(heading, "")
        if not content:
            print(f"\033[33m  ⚠ Section '{heading}' not found in response\033[0m")
        result[key] = _parse_field(content, field_type)

    return result


def print_parsed(stage: str, parsed: dict) -> None:
    """Print a structured preview of the parsed artifact to the terminal."""
    print(f"\n{'─' * 62}")
    print(f"  PARSED: {STAGE_LABELS[stage]}")
    print(f"{'─' * 62}")
    for key, val in parsed.items():
        if isinstance(val, str):
            preview = val[:100].replace("\n", " ")
            suffix = "…" if len(val) > 100 else ""
            print(f"  {key}: {preview}{suffix}")
        elif isinstance(val, list):
            print(f"  {key}: [{len(val)} items]  {json.dumps(val[0])[:80] if val else ''}…")
        elif isinstance(val, dict):
            print(f"  {key}: {{object}}  {json.dumps(val)[:80]}…")
        else:
            print(f"  {key}: {val}")
    print(f"{'─' * 62}")


# ── Context builders ──────────────────────────────────────────────────────────

def build_prd_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Effort: {triage.get('effort_score')}/5  "
        f"Impact: {triage.get('impact_score')}/5  "
        f"Confidence: {triage.get('confidence')}/5\n"
        f"Who benefits: {triage.get('who_benefits')}\n"
        f"Kill assumptions:\n"
        + "\n".join(f"- {a}" for a in triage.get("kill_assumptions", []))
        + f"\nReasoning: {triage.get('triage_reasoning')}\n\n"
        f"--- SHARPENING ---\n"
        f"Research synthesis:\n{dev.get('research_synthesis', '')}\n\n"
        f"Competitive landscape:\n{dev.get('competitive_landscape', '')}\n\n"
        f"Problem statement:\n{dev.get('problem_statement', '')}\n\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Personas:\n{json.dumps(dev.get('personas', []), indent=2)}\n\n"
        f"Open questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + "\n\n---\nProduce the PRD now."
    )


def build_mvp_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    prd = dev.get("prd") or {}
    prd_str = json.dumps(prd, indent=2) if isinstance(prd, dict) else str(prd)
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Effort: {triage.get('effort_score')}/5  "
        f"Impact: {triage.get('impact_score')}/5\n"
        f"Kill assumptions:\n"
        + "\n".join(f"- {a}" for a in triage.get("kill_assumptions", []))
        + f"\n\n--- SHARPENING ---\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Open questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + f"\n\n--- PRD ---\n{prd_str}\n\n"
        "---\nProduce the MVP scope now."
    )


def build_next_steps_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}
    prd = dev.get("prd") or {}
    mvp = dev.get("mvp_scope") or {}
    prd_str = json.dumps(prd, indent=2) if isinstance(prd, dict) else str(prd)
    mvp_str = json.dumps(mvp, indent=2) if isinstance(mvp, dict) else str(mvp)
    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Effort: {triage.get('effort_score')}/5  "
        f"Time horizon: {triage.get('time_horizon')}\n"
        f"Kill assumptions:\n"
        + "\n".join(f"- {a}" for a in triage.get("kill_assumptions", []))
        + f"\n\n--- SHARPENING ---\n"
        f"Core hypothesis:\n{dev.get('core_hypothesis', '')}\n\n"
        f"Open questions:\n"
        + "\n".join(f"- {q}" for q in dev.get("open_questions", []))
        + f"\n\n--- PRD ---\n{prd_str}\n\n"
        f"--- MVP SCOPE ---\n{mvp_str}\n\n"
        "---\nProduce the next steps plan now."
    )


def build_builder_brief_context(idea: dict) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}

    # ── Triage (compressed) ───────────────────────────────────────────────────
    effort = triage.get("effort_score", "?")
    impact = triage.get("impact_score", "?")
    disposition = triage.get("disposition", "?")

    # ── PRD (compressed) ─────────────────────────────────────────────────────
    prd = dev.get("prd") or {}
    prd_problem = (prd.get("problem") or "")[:200]
    prd_solution = prd.get("solution") or ""
    prd_stories = prd.get("user_stories") or []
    prd_out_of_scope = prd.get("out_of_scope") or []
    prd_metrics = prd.get("success_metrics") or []

    # ── MVP scope (compressed: names only for mvp_cut, full build_sequence) ──
    mvp = dev.get("mvp_scope") or {}
    mvp_cut_raw = mvp.get("mvp_cut") or []
    if mvp_cut_raw and isinstance(mvp_cut_raw[0], dict):
        mvp_cut_names = [f.get("name", str(f)) for f in mvp_cut_raw]
    else:
        mvp_cut_names = [str(f) for f in mvp_cut_raw]
    build_sequence = mvp.get("build_sequence") or []

    # ── Next steps (compressed: first_action, critical_path, action texts only)
    nxt = dev.get("next_steps") or {}
    first_action = nxt.get("first_action") or ""
    critical_path = nxt.get("critical_path") or ""
    res_actions_raw = nxt.get("resolution_actions") or []
    if res_actions_raw and isinstance(res_actions_raw[0], dict):
        res_action_texts = [a.get("action", str(a)) for a in res_actions_raw]
    else:
        res_action_texts = [str(a) for a in res_actions_raw]

    def _fmt_list(items: list) -> str:
        return "\n".join(f"- {i}" for i in items) if items else "(none)"

    return (
        f"RAW IDEA:\n{idea.get('raw_input', '')}\n\n"
        f"--- TRIAGE ---\n"
        f"Effort: {effort}/5  Impact: {impact}/5  Disposition: {disposition}\n\n"
        f"--- PRD (compressed) ---\n"
        f"Problem: {prd_problem}\n\n"
        f"Solution: {prd_solution}\n\n"
        f"User stories:\n{_fmt_list(prd_stories)}\n\n"
        f"Out of scope:\n{_fmt_list(prd_out_of_scope)}\n\n"
        f"Success metrics:\n{_fmt_list(prd_metrics)}\n\n"
        f"--- MVP SCOPE (compressed) ---\n"
        f"MVP cut (feature names):\n{_fmt_list(mvp_cut_names)}\n\n"
        f"Build sequence:\n{_fmt_list(build_sequence)}\n\n"
        f"--- NEXT STEPS (compressed) ---\n"
        f"First action: {first_action}\n\n"
        f"Critical path: {critical_path}\n\n"
        f"Resolution actions:\n{_fmt_list(res_action_texts)}\n\n"
        "---\nProduce the builder brief now."
    )


CONTEXT_BUILDERS = {
    "prd":           build_prd_context,
    "mvp_scope":     build_mvp_context,
    "next_steps":    build_next_steps_context,
    "builder_brief": build_builder_brief_context,
}

# ── Streaming ─────────────────────────────────────────────────────────────────

MAX_TOKENS: dict[str, int] = {
    "prd":           16000,
    "mvp_scope":     16000,
    "next_steps":    16000,
    "builder_brief": 16000,
}


def stream_stage(
    client: anthropic.Anthropic,
    system: str,
    user_message: str,
    label: str,
    max_tokens: int = 8192,
) -> str:
    """
    Stream one artifact stage to stdout with adaptive thinking.
    Returns the full accumulated text across all continuation turns.
    """
    messages = [{"role": "user", "content": user_message}]
    full_text = ""
    max_continuations = 5

    for _ in range(max_continuations):
        with client.messages.stream(
            model=MODEL,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=system,
            messages=messages,
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        print(event.delta.text, end="", flush=True)

            final = stream.get_final_message()

        for block in final.content:
            if block.type == "text":
                full_text += block.text

        if final.stop_reason not in ("pause_turn", "max_tokens"):
            print()  # trailing newline
            break

        # Continuation: serialize only the fields the API accepts.
        # model_dump() includes internal SDK fields that cause 400 errors.
        serialized = []
        for b in final.content:
            if b.type == "thinking":
                serialized.append({"type": "thinking", "thinking": b.thinking, "signature": b.signature})
            elif b.type == "text":
                serialized.append({"type": "text", "text": b.text})

        # Assistant turn must not end with a thinking block.
        while serialized and serialized[-1]["type"] == "thinking":
            serialized.pop()
        if not serialized:
            print("\n\033[33m⚠ Token budget exhausted during thinking — no text output.\033[0m")
            break
        messages.append({"role": "assistant", "content": serialized})
        messages.append({"role": "user", "content": "Continue."})
    else:
        print("\n\033[33m⚠ Hit continuation limit — output may be incomplete.\033[0m")

    print(f"\n\033[90m  Captured {len(full_text):,} characters\033[0m")
    return full_text


# ── Supabase ──────────────────────────────────────────────────────────────────

def fetch_idea(idea_id: str) -> dict:
    db = get_client()
    result = db.table("ideas").select("*").eq("id", idea_id).single().execute()
    if not result.data:
        print(f"\033[31m✗ No idea found with id {idea_id}\033[0m")
        sys.exit(1)
    return result.data


def save_artifact(idea_id: str, dev_key: str, value: dict, current_dev: dict) -> dict:
    """
    Merge one key into ideas.development and write to Supabase.
    Returns the updated development dict.
    """
    db = get_client()
    updated_dev = {**current_dev, dev_key: value}
    db.table("ideas").update({"development": updated_dev}).eq("id", idea_id).execute()
    return updated_dev


# ── Validation ────────────────────────────────────────────────────────────────

def validate_prerequisites(stage: str, idea: dict) -> None:
    dev = idea.get("development") or {}
    deps = {
        "prd":           [],
        "mvp_scope":     [("prd",       "development.prd")],
        "next_steps":    [("prd",       "development.prd"),
                          ("mvp_scope", "development.mvp_scope")],
        "builder_brief": [("prd",       "development.prd"),
                          ("mvp_scope", "development.mvp_scope"),
                          ("next_steps","development.next_steps")],
    }
    missing = [label for key, label in deps[stage] if not dev.get(key)]
    if missing:
        print(f"\n\033[33m⚠ Starting from '{stage}' but upstream outputs are missing:\033[0m")
        for m in missing:
            print(f"   - {m}")
        print("  Context passed to Claude will be incomplete. Proceed? [y/N] ", end="")
        if input().strip().lower() != "y":
            print("Aborted.")
            sys.exit(0)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Run the four-stage artifact chain.")
    parser.add_argument("idea_id", help="UUID of the idea to process")
    parser.add_argument(
        "--from", dest="from_stage", choices=STAGES, default="prd",
        help="Start pipeline from this stage (default: prd)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Call Claude and parse output, but do not write to Supabase",
    )
    args = parser.parse_args()

    print(f"\n{'═' * 62}")
    print("  KSM STUDIO — ARTIFACT GENERATION")
    print(f"{'═' * 62}")
    print(f"  idea_id:    {args.idea_id}")
    print(f"  start from: {args.from_stage}")
    if args.dry_run:
        print("  mode:       DRY RUN (parse only, no Supabase writes)")
    print()

    idea = fetch_idea(args.idea_id)

    if not idea.get("triage"):
        print("\033[31m✗ No triage output found. Run triage.py first.\033[0m")
        sys.exit(1)

    dev = idea.get("development") or {}
    if not dev.get("problem_statement"):
        print("\033[31m✗ No sharpening output found. Run sharpen.py first.\033[0m")
        sys.exit(1)

    print(f"  idea: {idea['triage'].get('title', '(no title)')}\n")

    validate_prerequisites(args.from_stage, idea)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    start_idx = STAGES.index(args.from_stage)
    stages_to_run = STAGES[start_idx:]

    current_dev = dev

    for stage in stages_to_run:
        label = STAGE_LABELS[stage]

        print(f"\n{'═' * 62}")
        print(f"  {label.upper()}")
        print(f"{'═' * 62}\n")

        # Reload idea so each stage gets the freshest development blob
        idea = fetch_idea(args.idea_id)
        current_dev = idea.get("development") or current_dev

        user_message = CONTEXT_BUILDERS[stage](idea)
        raw_text = stream_stage(client, SYSTEM_PROMPTS[stage], user_message, label,
                               max_tokens=MAX_TOKENS[stage])

        if not raw_text.strip():
            print(f"\n\033[31m✗ Claude returned empty output for {label}.\033[0m")
            sys.exit(1)

        parsed = parse_artifact(raw_text, SECTION_MAPS[stage])
        print_parsed(stage, parsed)

        if args.dry_run:
            print(f"\n\033[90m  [dry-run] Skipping Supabase write for {label}.\033[0m")
            # Update in-memory dev so subsequent stages get the parsed output
            current_dev = {**current_dev, stage: parsed}
        else:
            print(f"\n  Saving {label} to Supabase...")
            try:
                current_dev = save_artifact(args.idea_id, stage, parsed, current_dev)
                print(f"\033[32m  ✓ {label} saved to ideas.development.{stage}\033[0m")
            except Exception as exc:
                print(f"\n\033[31m✗ Save failed:\033[0m {exc}")
                print("\nParsed output (not saved):")
                print(json.dumps(parsed, indent=2))
                sys.exit(1)

    print(f"\n{'═' * 62}")
    print("  Artifact chain complete.")
    if args.dry_run:
        print("  [dry-run] Nothing written to Supabase.")
    print(f"{'═' * 62}\n")


if __name__ == "__main__":
    main()
