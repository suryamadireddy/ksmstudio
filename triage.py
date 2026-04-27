#!/usr/bin/env python3
"""
triage.py — Idea Triage Interview

Runs a conversational interview in the terminal via Claude.
When Claude has enough information it calls `complete_interview`, which
extracts a structured idea object and writes it to the Supabase `ideas` table.

Usage:
    python triage.py

Writes to `ideas.triage` (JSONB):
    {
      "title":             str,
      "effort_score":      int (1–5),
      "impact_score":      int (1–5),
      "confidence":        int (1–5),
      "time_horizon":      "weeks" | "months" | "years",
      "who_benefits":      str,
      "kill_assumptions":  list[dict],  # each: {"text": str, "status": str}
      "category":          str,
      "provisional":       bool,
      "triage_reasoning":  str,
      "disposition":       "pursue" | "potential" | "park" | "discard",
      "triaged_at":        iso8601
    }
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone

import anthropic

from config import ANTHROPIC_API_KEY, REASONING_MODEL as MODEL
from db import get_client

# ── Prompts & tool definition ─────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a Socratic evaluator for a personal idea development system. Your job \
is to stress-test both the idea and the thinking behind it — then produce an \
honest structured evaluation. You are not a form. You are not a checklist. You \
are a rigorous thinker who meets the user exactly where they are and pushes \
them one level deeper than they expected to go.

## Your identity

You are a mentor — not a judge, not a cheerleader. Think of yourself as a \
professor who genuinely wants this person to become a sharper thinker, and \
who uses each idea as the raw material for that growth. You have seen \
thousands of ideas. You know where people fool themselves. But your goal is \
not to expose foolishness — it is to create the conditions where the user \
discovers their own blind spots and learns to think past them.

You are warm but never soft. You respect the user enough to be honest. You \
never praise an answer just because it was given. You never move on from a \
weak answer just to be polite.

## What you will produce

At the end of the session you will call complete_interview with a structured \
triage object. Do not call it until you are genuinely satisfied that:
(a) you understand the idea well enough to score it honestly, AND
(b) the user has been pushed to articulate their thinking at a level deeper \
than they came in with — or you have helped them see specifically where \
their thinking broke down.

During the session, only ask questions and reflect back what you are hearing. \
Do not score or categorize out loud.

## How to conduct the session

You do not follow a fixed sequence. Instead, you have a set of dimensions \
you need to probe. You choose which to probe, in what order, and how deeply \
based on what the user gives you.

### The dimensions

1. **Problem clarity** — Is this a real problem for a real person, or an \
   abstraction? Can the user describe the person and the pain concretely?

2. **Impact mechanism** — Not "how big could this be" but "what specifically \
   changes and for whom." Evidence over assertion. Mechanism over magnitude.

3. **Effort realism** — What does the minimum useful version actually require? \
   What is the hardest part? What dependencies exist that the user does not \
   control?

4. **Falsifiability** — What assumptions must be true? What would kill this? \
   Can the user name the conditions under which they would walk away?

5. **Founder–idea fit** — Why this person, this idea, this moment? What does \
   the user uniquely bring that makes them the right person to do this? What \
   are they missing? For business ideas: how does this fit into the portfolio \
   of ventures they are building? Does it compound with what they already have \
   — skills, audience, infrastructure, capital — or is it an isolated bet? \
   The user is building toward running multiple businesses. Each venture \
   should be a stepping stone, not a dead end. For non-business ideas: does \
   this sharpen a skill, scratch a genuine itch, or explore something the \
   user cares about? Even non-commercial ideas should have a clear "why now \
   and why me."

6. **Commercial viability** — Probe this dimension ONLY for ideas the user \
   frames as a business, product, or venture. If the user describes something \
   as a personal project, creative exploration, internal process improvement, \
   or learning exercise, skip this dimension entirely and do not force a \
   revenue conversation. \
   \
   For business ideas: every idea must answer — who pays, why do they pay, \
   and what does the first dollar of revenue look like? Do not accept "we \
   will figure out monetization later" — that is a red flag, not a strategy. \
   Probe the business model with the same rigor you apply to the problem. \
   Can the user articulate unit economics at even a rough level? Is there a \
   clear value-to-price gap — meaning the customer gets significantly more \
   value than what they pay? Is revenue recurring or one-time? Does the model \
   scale, or does it require the user's time for every dollar earned? The \
   user wants to build businesses that generate money continuously. A \
   beautiful solution with no path to revenue is a hobby, not a venture. \
   \
   If you are unsure whether an idea is meant to be a business, ask early: \
   "Is this something you want to make money from, or is this a personal \
   project?" That one question determines whether this dimension applies.

You do not need to probe every dimension with equal depth. If the user's \
description of the problem is razor-sharp, spend one question confirming it \
and move on. If their impact reasoning is pure optimism, stay there until \
they either produce evidence or acknowledge the gap.

### Adaptive depth

Read the user's responses for signals of sophistication:
- **Strong signals**: specific numbers, named competitors, direct user \
  conversations, falsifiable hypotheses, acknowledgment of what they do not \
  know. For business ideas: clear articulation of who pays and why, rough \
  unit economics, awareness of how this fits their broader portfolio of \
  ventures.
- **Weak signals**: vague audiences ("people who..."), assumed demand \
  ("everyone needs..."), no evidence cited, scope described only in features \
  not outcomes, inability to name a kill assumption. For business ideas: \
  no revenue model or "we will monetize later," treating the idea as \
  isolated rather than as part of a growing portfolio.

When you detect strong signals, match their level. Ask harder questions. \
Push on second-order effects. Challenge whether their evidence actually \
supports their conclusion or whether they are pattern-matching from a \
different context.

When you detect weak signals, do not ask harder questions — that teaches \
nothing. Instead, help them see the gap:
- Name what is missing: "You have described who benefits but not how you \
  know they exist. What is the difference between a problem you imagine \
  and a problem you have observed?"
- Reframe their thinking: "You said 'everyone needs this.' Let me push on \
  that — name one specific person. Not a type of person. One person you \
  know, or could find, who has this problem today. What are they doing \
  about it right now?"
- Offer a thinking tool: "A useful test — if this problem disappeared \
  tomorrow and nobody built your solution, would anyone notice? Who \
  would notice first?"

The goal is that the user leaves the session thinking differently, not just \
having been evaluated.

### Challenging without discouraging

You ask questions the way a great case study professor does:
- You do not accept the first answer if it is surface-level. "Go deeper. \
  Why specifically?"
- You test whether the user actually understands their own idea by asking \
  them to explain it from an angle they have not considered: "Explain this \
  idea from the perspective of someone who would actively resist using it. \
  Why would they say no?"
- You use inversion: "What would have to be true for this to be a \
  terrible idea? Now — are any of those things actually true?"
- You use constraints: "Imagine you could only build one feature and had \
  two weeks. What would it be and why would anyone care?"
- You probe commercial clarity (for business ideas): "Walk me through the \
  first transaction. Someone finds your product. What happens next? When \
  do they pay? How much? Why that amount and not half or double?"

These are not gotcha questions. They are tools that force clarity. When the \
user answers well, you acknowledge it simply and move on. "That is clear. \
Let me push on something else." When they struggle, you do not move on — \
you help them work through it.

## When to end the session

End the session when ONE of these is true:

1. **Satisfied**: You have enough signal across all dimensions to score \
   honestly, AND the user has demonstrated that they understand the idea \
   at a deeper level than when they started — even if the idea itself is \
   weak.

2. **Reached a wall**: The user cannot articulate the core problem, or \
   cannot name who it is for, or cannot identify a single kill assumption \
   even after you have helped them try. You have given them thinking tools \
   and they are still stuck. Score what you can and note the gaps in \
   growth_observations.

3. **Clarity achieved quickly**: The user came in with a well-developed \
   idea, answered every challenge cleanly, and there is nothing more to \
   push on. Do not extend the session artificially. Three sharp exchanges \
   can be enough.

Do NOT end the session just because you have asked enough questions. End it \
when you have learned enough AND the user has been stretched.

## Prior session context

{{PRIOR_TRIAGE_CONTEXT}}

If prior sessions are present, use them to calibrate:
- Notice patterns: Does the user consistently underestimate effort? \
  Overestimate market size? Struggle to name kill assumptions? \
  Probe these tendencies directly.
- Notice growth: If a weakness from a prior session is now a strength, \
  acknowledge it briefly and move on. Do not re-test what they have \
  already internalized.
- Raise the bar: If prior sessions show strong fundamentals, start at a \
  higher level. Skip basic problem-definition questions and go straight \
  to second-order challenges: market timing, defensibility, why now, \
  what is the compounding advantage. Push on portfolio-level thinking: \
  "You already have [prior ideas]. How does this new idea make your \
  portfolio stronger? Does it share infrastructure, audience, or \
  insight with what you are already building?"

If no prior sessions exist, start by listening carefully to the first \
response and calibrate from there.

## Scoring

After the session, derive scores internally before calling complete_interview.

Effort score (1–5):
1 = Can be built alone in days with existing skills
2 = A few weeks, mostly within existing skills, minor new learning
3 = 1–3 months, requires new skills or collaborators
4 = 3–12 months, significant new skills, team, or capital
5 = 12+ months, major resource requirements

Impact score (1–5):
1 = Affects a small number of people in a minor way, or only the user.
2 = Meaningful improvement for a small audience, or minor improvement \
    for a large one.
3 = Meaningful improvement for a meaningful audience with a plausible \
    path to value creation. For business ideas: someone would pay for \
    this. For non-business ideas: this meaningfully solves the problem \
    it set out to solve.
4 = Significant improvement for a large audience, or transformative \
    for a meaningful one. For business ideas: clear willingness to pay \
    and a model that could generate recurring revenue. For non-business \
    ideas: this could become a reference or standard in its space.
5 = Transformative improvement at scale. For business ideas: strong \
    commercial pull — people are already paying for inferior alternatives. \
    Revenue compounds over time. For non-business ideas: this changes \
    how people think about or approach the problem.

Confidence score (1–5):
1 = Mostly speculation, no external validation
2 = Reasonable assumptions, no direct evidence
3 = Some user conversations or market signals
4 = Strong evidence from multiple sources
5 = Direct validation — people have asked for this or paid for \
    something like it

Category derivation — output an INTEGER 1, 2, 3, or 4:
- category = 1 if effort_score ≤ 2 AND impact_score ≥ 3
- category = 2 if effort_score ≥ 3 AND impact_score ≥ 4
- category = 3 if effort_score ≤ 2 AND impact_score ≤ 2
- category = 4 if effort_score ≥ 3 AND impact_score ≤ 2
Gap case (e.g. effort=3, impact=3): impact ≥ 3 is the tiebreaker \
for category 2 vs 4.

Disposition derived from category:
- 1 → pursue, 2 → potential, 3 → park, 4 → discard

If confidence < 3, mark provisional as true.

## Behavioral rules
- One question at a time. Always.
- Never reveal scores, category, or disposition during the session.
- If the user tries to self-score, redirect: "That is useful context. \
  But I want to derive my own read — let me ask you something."
- If the user is consistently vague, name it directly but constructively: \
  "I notice you are describing this at a high level. That is natural at \
  this stage. Let us get concrete — tell me about one specific person \
  who has this problem. Not a persona. A real person or a real situation \
  you have observed."
- Never use filler: no "Great!", "Awesome!", "That's interesting!" \
  If an answer is strong, say so precisely: "That is a clear answer. \
  It tells me the problem is specific and you have observed it directly."
- Be concise. Your questions should be short. Your reflections should be \
  one to two sentences, not paragraphs.
- The session should feel like a conversation with someone who is fully \
  present and genuinely invested in making the user's thinking sharper — \
  not like an interrogation or an exam.
"""

COMPLETE_TOOL: dict = {
    "name": "complete_interview",
    "description": (
        "Call this when you have gathered enough information to accurately score "
        "and evaluate the idea. Do not call with vague or placeholder values."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "3–6 word title for the idea (e.g. 'AI Lease Review for Renters')",
            },
            "effort_score": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5,
                "description": (
                    "Effort required to build and launch an MVP. "
                    "1 = can be built alone in days with existing skills, "
                    "5 = 12+ months, major resource requirements."
                ),
            },
            "impact_score": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5,
                "description": (
                    "Potential upside if this works. "
                    "1 = affects a small number of people in a minor way, "
                    "5 = transformative improvement at scale."
                ),
            },
            "confidence": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5,
                "description": (
                    "Confidence that the problem is real and the solution will be adopted. "
                    "1 = mostly speculation, no external validation, "
                    "5 = direct validation — people have asked for this or paid for something like it."
                ),
            },
            "time_horizon": {
                "type": "string",
                "enum": ["immediate", "3mo", "6mo", "1yr", "3yr+"],
                "description": (
                    "Realistic time to first meaningful signal (not full launch). "
                    "immediate = days to a few weeks, 3mo = ~3 months, "
                    "6mo = ~6 months, 1yr = ~1 year, 3yr+ = multi-year."
                ),
            },
            "who_benefits": {
                "type": "string",
                "description": (
                    "The most specific possible description of the primary beneficiary — "
                    "not a demographic, a person in a situation."
                ),
            },
            "kill_assumptions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "The assumption stated as a falsifiable claim.",
                        },
                        "status": {
                            "type": "string",
                            "enum": ["untested", "validated", "invalidated", "weakened", "strengthened"],
                            "description": "Current status. Always 'untested' for new triages.",
                        },
                    },
                    "required": ["text", "status"],
                },
                "description": (
                    "2–4 assumptions that, if false, make this idea not worth pursuing. "
                    "Each should be falsifiable. Most direction-changing first. "
                    "Set status to 'untested' for all assumptions in a new triage."
                ),
            },
            "category": {
                "type": "integer",
                "minimum": 1,
                "maximum": 4,
                "description": (
                    "Integer 1–4 derived from effort_score and impact_score. "
                    "1 = effort ≤ 2 AND impact ≥ 3, "
                    "2 = effort ≥ 3 AND impact ≥ 4, "
                    "3 = effort ≤ 2 AND impact ≤ 2, "
                    "4 = effort ≥ 3 AND impact ≤ 2."
                ),
            },
            "provisional": {
                "type": "boolean",
                "description": (
                    "True if any scores are based on thin information and should "
                    "be revisited after more research. False if you have solid "
                    "basis for all scores."
                ),
            },
            "triage_reasoning": {
                "type": "string",
                "description": (
                    "2–4 sentences explaining the scoring. Specifically call out "
                    "the highest-risk kill assumption and why the effort/impact "
                    "scores landed where they did."
                ),
            },
            "disposition": {
                "type": "string",
                "enum": ["pursue", "potential", "park", "discard"],
                "description": (
                    "Derived directly from category: "
                    "'pursue' = category 1 (low effort, high impact). "
                    "'potential' = category 2 (high effort, high impact). "
                    "'park' = category 3 (low effort, low impact). "
                    "'discard' = category 4 (high effort, low impact)."
                ),
            },
            "growth_observations": {
                "type": "string",
                "description": (
                    "2–4 sentences reflecting on the user's thinking process in this "
                    "session, not just the idea itself. What did they do well? Where "
                    "did their reasoning break down? What pattern should they watch "
                    "for in future ideas? Write this as direct, constructive feedback "
                    "to the user — it will be shown to them."
                ),
            },
            "session_level": {
                "type": "string",
                "enum": ["foundational", "intermediate", "advanced"],
                "description": (
                    "The level at which this session operated. "
                    "'foundational' = user needed help with basics like problem "
                    "definition, identifying who benefits, or distinguishing "
                    "assumptions from evidence. "
                    "'intermediate' = user had solid basics but needed pushing on "
                    "evidence quality, effort realism, or kill assumption clarity. "
                    "'advanced' = user demonstrated strong fundamentals and was "
                    "challenged on second-order questions like defensibility, "
                    "timing, compounding advantages, or market structure."
                ),
            },
        },
        "required": [
            "title",
            "effort_score",
            "impact_score",
            "confidence",
            "time_horizon",
            "who_benefits",
            "kill_assumptions",
            "category",
            "provisional",
            "triage_reasoning",
            "disposition",
        ],
    },
}

# ── Streaming helper ──────────────────────────────────────────────────────────

def stream_claude(
    client: anthropic.Anthropic,
    messages: list,
    system_prompt: str,
) -> tuple[list, dict | None]:
    """
    Stream one Claude turn to stdout.

    Returns:
        (content_blocks, tool_input)
        content_blocks — list ready to embed as the assistant message
        tool_input     — the `complete_interview` input dict, or None
    """
    content_blocks: list = []
    tool_input: dict | None = None

    with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
        system=system_prompt,
        tools=[COMPLETE_TOOL],
        tool_choice={"type": "auto"},
        thinking={"type": "adaptive"},
        messages=messages,
    ) as stream:
        current_block_type: str | None = None

        for event in stream:
            if event.type == "content_block_start":
                current_block_type = event.content_block.type
                if current_block_type == "tool_use":
                    print()  # newline before tool output

            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    print(event.delta.text, end="", flush=True)

            elif event.type == "content_block_stop":
                current_block_type = None

        final = stream.get_final_message()

    # Build content_blocks from the final message (preserves real tool_use IDs)
    for block in final.content:
        if block.type == "text":
            content_blocks.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            content_blocks.append(
                {
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                }
            )
            if block.name == "complete_interview":
                tool_input = block.input

    # Ensure trailing newline after streamed text
    has_text = any(b["type"] == "text" for b in content_blocks)
    if has_text:
        print()

    return content_blocks, tool_input


# ── Supabase write ────────────────────────────────────────────────────────────

_TIME_HORIZON_MAP = {
    # exact values pass through; map common variants to valid enum
    "immediate": "immediate",
    "3mo": "3mo",
    "6mo": "6mo",
    "1yr": "1yr",
    "3yr+": "3yr+",
    # approximate mappings for non-enum strings Claude may return
    "weeks": "immediate",
    "days": "immediate",
    "week": "immediate",
    "month": "3mo",
    "months": "3mo",
    "3 months": "3mo",
    "6 months": "6mo",
    "six months": "6mo",
    "year": "1yr",
    "years": "3yr+",
    "1 year": "1yr",
    "2 years": "3yr+",
    "3 years": "3yr+",
    "3+ years": "3yr+",
    "multi-year": "3yr+",
}


def _derive_category(effort: int, impact: int) -> int:
    if effort <= 2 and impact >= 3:
        return 1
    if effort >= 3 and impact >= 4:
        return 2
    if effort <= 2 and impact <= 2:
        return 3
    if effort >= 3 and impact <= 2:
        return 4
    # gap case (e.g. effort=3, impact=3): impact ≥ 3 → category 2, else 4
    return 2 if impact >= 3 else 4


def _validate_fields(idea_data: dict) -> dict:
    """
    Validate and correct category and time_horizon before writing to Supabase.
    Returns a copy of idea_data with any corrections applied.
    """
    data = dict(idea_data)

    # ── category ─────────────────────────────────────────────────────────────
    cat = data.get("category")
    if not isinstance(cat, int) or cat not in (1, 2, 3, 4):
        effort = data.get("effort_score", 3)
        impact = data.get("impact_score", 3)
        derived = _derive_category(effort, impact)
        print(
            f"\033[33m⚠ category value {cat!r} is invalid — "
            f"derived {derived} from effort={effort}, impact={impact}\033[0m"
        )
        data["category"] = derived

    # ── disposition ──────────────────────────────────────────────────────────
    CATEGORY_DISPOSITION = {1: "pursue", 2: "potential", 3: "park", 4: "discard"}
    VALID_DISPOSITIONS = set(CATEGORY_DISPOSITION.values())
    disp = data.get("disposition")
    expected = CATEGORY_DISPOSITION.get(data["category"])
    if disp not in VALID_DISPOSITIONS or disp != expected:
        print(
            f"\033[33m⚠ disposition {disp!r} corrected to {expected!r} "
            f"(category {data['category']})\033[0m"
        )
        data["disposition"] = expected

    # ── time_horizon ─────────────────────────────────────────────────────────
    th = data.get("time_horizon", "")
    mapped = _TIME_HORIZON_MAP.get(str(th).lower().strip())
    if mapped is None:
        # unknown value — fall back to "6mo" as a neutral midpoint
        print(
            f"\033[33m⚠ time_horizon value {th!r} is not a valid enum — "
            f"defaulting to '6mo'\033[0m"
        )
        data["time_horizon"] = "6mo"
    elif mapped != th:
        print(
            f"\033[33m⚠ time_horizon value {th!r} mapped to '{mapped}'\033[0m"
        )
        data["time_horizon"] = mapped

    # ── kill_assumptions — normalize to object format ─────────────────────────
    raw_ka = data.get("kill_assumptions", [])
    normalized = []
    for item in raw_ka:
        if isinstance(item, str):
            normalized.append({"text": item, "status": "untested"})
        elif isinstance(item, dict) and "text" in item:
            if "status" not in item:
                item["status"] = "untested"
            normalized.append(item)
    data["kill_assumptions"] = normalized

    return data


def save_idea(idea_data: dict, transcript: list, raw_input: str, domain: str = "product") -> str:
    """Insert a new row into `ideas`; return the generated idea_id."""
    db = get_client()
    validated = _validate_fields(idea_data)
    idea_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": idea_id,
        "raw_input": raw_input,
        "domain": domain,
        "triage_version": 1,
        "triage": {
            **validated,
            "triaged_at": now,
        },
    }
    db.table("ideas").insert(row).execute()

    # Write triage conversation + messages
    conv_id = str(uuid.uuid4())
    db.table("conversations").insert({
        "id": conv_id,
        "idea_id": idea_id,
        "context": "triage",
        "created_at": now,
    }).execute()
    for entry in transcript:
        db.table("messages").insert({
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "idea_id": idea_id,
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
            "created_at": now,
        }).execute()

    return idea_id


# ── Main interview loop ───────────────────────────────────────────────────────

MAX_TURNS = 20  # safety ceiling on interview length


def fetch_prior_triages(exclude_id: str | None = None) -> str:
    """
    Fetch triage data from previous ideas to inject as context
    for adaptive difficulty. Optionally exclude one idea by id
    (used during re-triage to avoid self-referencing).

    Returns a formatted string block, or empty string if none found.
    """
    db = get_client()
    result = (
        db.table("ideas")
        .select("id, triage")
        .not_.is_("triage", "null")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    if not result.data:
        return ""

    rows = [r for r in result.data if r["id"] != exclude_id]
    if not rows:
        return ""

    lines = ["You have conducted prior triage sessions with this user:\n"]
    for i, row in enumerate(rows, 1):
        t = row.get("triage") or {}
        lines.append(
            f"Session {i}: \"{t.get('title', 'Untitled')}\"\n"
            f"  Scores: effort={t.get('effort_score')}, "
            f"impact={t.get('impact_score')}, "
            f"confidence={t.get('confidence')}\n"
            f"  Disposition: {t.get('disposition')}\n"
            f"  Level: {t.get('session_level', 'unknown')}\n"
            f"  Growth observations: "
            f"{t.get('growth_observations', 'none recorded')}\n"
        )

    return "\n".join(lines)


def run_triage() -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Fetch prior session context for adaptive difficulty
    prior_context = fetch_prior_triages()
    active_prompt = SYSTEM_PROMPT.replace("{{PRIOR_TRIAGE_CONTEXT}}", prior_context)

    messages: list = []
    transcript: list = []
    idea_data: dict | None = None
    raw_input: str = ""

    print("\n" + "═" * 62)
    print("  KSM STUDIO — IDEA TRIAGE")
    print("═" * 62)
    print("  Share your idea. Claude will interview you.")
    print("  Ctrl+C to quit at any time.\n")

    # Seed the conversation so Claude opens with its first question
    messages.append(
        {"role": "user", "content": "I have a new idea I'd like to triage."}
    )
    transcript.append(
        {"role": "user", "content": "I have a new idea I'd like to triage.", "turn": 0}
    )

    for turn in range(MAX_TURNS):
        # ── Claude speaks ────────────────────────────────────────────────────
        print(f"\n\033[36mClaude:\033[0m ", end="")
        content_blocks, tool_input = stream_claude(client, messages, active_prompt)

        # Append assistant turn to message history
        messages.append({"role": "assistant", "content": content_blocks})

        # Extract assistant text for the transcript
        assistant_text = " ".join(
            b["text"] for b in content_blocks if b["type"] == "text"
        )
        transcript.append(
            {"role": "assistant", "content": assistant_text, "turn": turn}
        )

        # If Claude called complete_interview, we're done
        if tool_input is not None:
            idea_data = tool_input
            break

        # ── User speaks ──────────────────────────────────────────────────────
        print(f"\n\033[33mYou:\033[0m ", end="")
        try:
            user_input = input().strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nInterview cancelled.")
            sys.exit(0)

        if not user_input:
            # Reprompt without advancing the turn counter
            messages.append({"role": "user", "content": "(no response)"})
            continue

        if not raw_input:
            raw_input = user_input  # capture the user's first typed response

        messages.append({"role": "user", "content": user_input})
        transcript.append({"role": "user", "content": user_input, "turn": turn})

    if idea_data is None:
        print("\n\033[31mInterview hit the turn limit without completing.\033[0m")
        print("Tip: Be more concise so Claude can complete the triage sooner.")
        sys.exit(1)

    # ── Domain prompt ─────────────────────────────────────────────────────────
    VALID_DOMAINS = {"product", "process", "business", "personal", "other"}
    print("\nDomain? (product/process/business/personal/other): ", end="", flush=True)
    try:
        domain_input = input().strip().lower()
    except (EOFError, KeyboardInterrupt):
        domain_input = ""
    domain = domain_input if domain_input in VALID_DOMAINS else "product"

    # ── Persist to Supabase ───────────────────────────────────────────────────
    print("\n" + "─" * 62)
    print("  Saving idea to Supabase...")

    try:
        idea_id = save_idea(idea_data, transcript, raw_input, domain)
    except Exception as exc:
        print(f"\n\033[31m✗ Save failed:\033[0m {exc}")
        print("\nExtracted idea (not saved):")
        print(json.dumps(idea_data, indent=2))
        sys.exit(1)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n\033[32m✓ Saved.\033[0m  idea_id: \033[1m{idea_id}\033[0m\n")
    print(json.dumps(idea_data, indent=2))
    print("\n" + "═" * 62)
    print(f"  Next:  python sharpen.py --idea-id {idea_id}")
    print("═" * 62 + "\n")

    return idea_id


# ── Re-triage helpers ─────────────────────────────────────────────────────────

def _build_retriage_context(
    idea: dict,
    current_triage: dict,
    development: dict,
    db=None,
) -> str:
    """
    Build the context block for re-triaging an existing idea.
    Includes the idea's full history so the agent can assess evolution.
    """
    lines = [
        "## This is a RE-TRIAGE of an existing idea.",
        "",
        f"Original idea: \"{idea.get('raw_input', '')}\"",
        "",
        f"### Current triage (version {current_triage.get('triage_version', 1)}):",
        f"- Scores: effort={current_triage.get('effort_score')}, "
        f"impact={current_triage.get('impact_score')}, "
        f"confidence={current_triage.get('confidence')}",
        f"- Disposition: {current_triage.get('disposition')}",
        f"- Who benefits: {current_triage.get('who_benefits')}",
        "- Kill assumptions:",
    ]
    for a in current_triage.get("kill_assumptions", []):
        text = a["text"] if isinstance(a, dict) else a
        status = a.get("status", "untested") if isinstance(a, dict) else "untested"
        lines.append(f"  - {text} [{status}]")
    lines.append(f"- Reasoning: {current_triage.get('triage_reasoning')}")
    lines.append(f"- Triaged at: {current_triage.get('triaged_at')}")
    lines.append("")

    # Prior triage versions (if any)
    history = current_triage.get("triage_history", [])
    if history:
        lines.append(f"### Prior triage versions ({len(history)}):")
        for prior in history:
            lines.append(
                f"- v{prior.get('triage_version')} "
                f"({prior.get('triaged_at')}): "
                f"effort={prior.get('effort_score')}, "
                f"impact={prior.get('impact_score')}, "
                f"disposition={prior.get('disposition')}"
            )
        lines.append("")

    # Development artifacts if present
    if development.get("problem_statement"):
        lines.append("### Sharpening output exists")
        lines.append(
            f"Problem statement: {development['problem_statement'][:300]}..."
        )
        lines.append("")
    if development.get("prd"):
        lines.append("### PRD exists")
        lines.append("")
    if development.get("builder_brief"):
        lines.append("### Builder brief exists")
        lines.append("")

    # Fetch triage insights since last triage
    _db = db or get_client()
    insight_entries = (
        _db.table("journal_entries")
        .select("content, created_at")
        .eq("idea_id", idea["id"])
        .eq("type", "triage_insight")
        .gt("created_at", current_triage.get("triaged_at", ""))
        .order("created_at")
        .execute()
    ).data or []

    if insight_entries:
        lines.append("### Triage insights flagged since last evaluation:")
        for entry in insight_entries:
            lines.append(
                f"- [{entry['created_at'][:10]}] {entry['content']}"
            )
        lines.append("")

    lines.append("### Your job for this re-triage:")
    lines.append(
        "You are re-evaluating an idea that has a history. "
        "The user has new thinking, new evidence, or has requested "
        "a fresh look. Probe what has changed. Challenge whether "
        "previous kill assumptions are still the right ones. "
        "Notice if the user has grown in their thinking about this "
        "specific idea — and name it when you see it. Compare the "
        "current articulation to the prior one and surface what is "
        "sharper now and what is still unclear."
    )

    return "\n".join(lines)


def save_retriage(idea_id: str, new_triage_data: dict, transcript: list) -> None:
    """
    Append the current triage to triage_history, then replace the
    top-level triage with the new one. Increment triage_version column.
    """
    db = get_client()
    validated = _validate_fields(new_triage_data)

    # Fetch current triage
    result = (
        db.table("ideas")
        .select("triage, triage_version")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    current_triage = result.data.get("triage") or {}
    current_version = result.data.get("triage_version") or current_triage.get("triage_version", 1)

    # Move current triage into history — strip raw_transcript and triage_history
    history = list(current_triage.get("triage_history", []))
    snapshot = {
        k: v for k, v in current_triage.items()
        if k not in ("triage_history", "raw_transcript")
    }
    history.append(snapshot)

    now = datetime.now(timezone.utc).isoformat()

    # Build new triage object — no raw_transcript
    new_triage = {
        **validated,
        "triaged_at": now,
        "triage_version": current_version + 1,
        "triage_history": history,
    }

    db.table("ideas").update({
        "triage": new_triage,
        "triage_version": current_version + 1,
        "retriage_pending": False,
        "retriage_reasons": [],
    }).eq("id", idea_id).execute()

    # Write retriage conversation + messages
    conv_id = str(uuid.uuid4())
    db.table("conversations").insert({
        "id": conv_id,
        "idea_id": idea_id,
        "context": "retriage",
        "created_at": now,
    }).execute()
    for entry in transcript:
        db.table("messages").insert({
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "idea_id": idea_id,
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
            "created_at": now,
        }).execute()


def run_retriage(idea_id: str) -> None:
    """
    Re-triage an existing idea. Pulls the full history of the idea,
    injects it into the Socratic prompt, runs a new session, and
    appends the result to triage_history.
    """
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    db = get_client()

    # Fetch the idea with all history
    result = (
        db.table("ideas")
        .select("id, raw_input, triage, development")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    if not result.data:
        print(f"\033[31m✗ No idea found with id {idea_id}\033[0m")
        sys.exit(1)

    idea = result.data
    current_triage = idea.get("triage") or {}
    development = idea.get("development") or {}

    # Build re-triage context
    retriage_context = _build_retriage_context(idea, current_triage, development, db=db)

    # Fetch prior triages across other ideas for growth tracking
    prior_context = fetch_prior_triages(exclude_id=idea_id)

    # Combine both into the prompt
    combined_context = retriage_context
    if prior_context:
        combined_context += "\n\n" + prior_context

    active_prompt = SYSTEM_PROMPT.replace("{{PRIOR_TRIAGE_CONTEXT}}", combined_context)

    print("\n" + "═" * 62)
    print("  KSM STUDIO — IDEA RE-TRIAGE")
    print("═" * 62)
    title = current_triage.get("title", idea.get("raw_input", idea_id)[:60])
    print(f"  Re-triaging: {title}")
    print(f"  Current: disposition={current_triage.get('disposition')}, "
          f"v{current_triage.get('triage_version', 1)}")
    print("  Ctrl+C to quit at any time.\n")

    # Seed with re-triage opener
    messages: list = [
        {
            "role": "user",
            "content": (
                f"I want to re-triage this existing idea: "
                f"\"{current_triage.get('title', idea.get('raw_input', ''))}\". "
                "Here is what I want to revisit or update about it."
            ),
        }
    ]
    transcript: list = [
        {"role": "user", "content": messages[0]["content"], "turn": 0}
    ]
    idea_data: dict | None = None

    for turn in range(MAX_TURNS):
        print(f"\n\033[36mClaude:\033[0m ", end="")
        content_blocks, tool_input = stream_claude(client, messages, active_prompt)

        messages.append({"role": "assistant", "content": content_blocks})
        assistant_text = " ".join(
            b["text"] for b in content_blocks if b["type"] == "text"
        )
        transcript.append({"role": "assistant", "content": assistant_text, "turn": turn})

        if tool_input is not None:
            idea_data = tool_input
            break

        print(f"\n\033[33mYou:\033[0m ", end="")
        try:
            user_input = input().strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nRe-triage cancelled.")
            sys.exit(0)

        if not user_input:
            messages.append({"role": "user", "content": "(no response)"})
            continue

        messages.append({"role": "user", "content": user_input})
        transcript.append({"role": "user", "content": user_input, "turn": turn})

    if idea_data is None:
        print("\n\033[31mRe-triage hit the turn limit without completing.\033[0m")
        sys.exit(1)

    # Persist
    print("\n" + "─" * 62)
    print("  Saving re-triage to Supabase...")

    try:
        save_retriage(idea_id, idea_data, transcript)
    except Exception as exc:
        print(f"\n\033[31m✗ Save failed:\033[0m {exc}")
        print("\nExtracted triage (not saved):")
        print(json.dumps(idea_data, indent=2))
        sys.exit(1)

    old_disp = current_triage.get("disposition")
    new_disp = idea_data.get("disposition")
    mobility = f" (\033[33m{old_disp} → {new_disp}\033[0m)" if old_disp != new_disp else ""

    print(f"\n\033[32m✓ Re-triage saved.\033[0m  idea_id: \033[1m{idea_id}\033[0m{mobility}\n")
    print(json.dumps(idea_data, indent=2))
    print("\n" + "═" * 62 + "\n")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--retriage",
        metavar="IDEA_ID",
        help="Re-triage an existing idea by id",
    )
    args = parser.parse_args()

    if args.retriage:
        run_retriage(args.retriage)
    else:
        run_triage()
