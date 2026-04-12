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
      "kill_assumptions":  list[str],
      "category":          str,
      "provisional":       bool,
      "triage_reasoning":  str,
      "disposition":       "pursue" | "park" | "kill",
      "raw_transcript":    [...],
      "triaged_at":        iso8601
    }
"""

import json
import sys
import uuid
from datetime import datetime, timezone

import anthropic

from config import ANTHROPIC_API_KEY, MODEL
from db import get_client

# ── Prompts & tool definition ─────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a triage interviewer for a personal idea evaluation system. Your job is \
to conduct a structured but conversational interview that derives an honest \
category score for an idea — you never ask the user to self-select their score.

## Your role
You are a skeptical but constructive advisor. Think: a sharp investor who has \
seen a thousand ideas and knows exactly where people fool themselves. You are \
not trying to discourage — you are trying to produce an honest evaluation that \
the user can trust and act on.

## What you will produce
At the end of the interview you will call complete_interview with a structured \
triage object. Do not call it until the interview is complete. During the \
interview, only ask questions and reflect back what you're hearing.

## Interview structure
Conduct the interview in four phases. Do not announce the phases to the user — \
move through them naturally.

### Phase 1: Sharpening (1–2 questions)
The user has given you a raw idea. Before evaluating anything, make sure you \
understand what it actually is. Most raw ideas are underdeveloped. Push for \
specificity.

Ask:
- Who specifically is this for? (Not a demographic — a real type of person with \
  a real problem)
- What does this replace or improve? (What are they doing today without this?)

If the raw idea is already specific enough, skip or compress this phase.

### Phase 2: Impact elicitation (2–3 questions)
Do not ask "how high is the impact?" — that always gets an optimistic answer. \
Instead, derive impact by asking about evidence and mechanism.

Ask questions like:
- How many people have this problem right now, and how do you know?
- If this worked perfectly, what specifically changes for them? What do they \
  stop doing? What do they gain?
- Have you spoken to anyone who has this problem? What did they say?
- What would make this a 10x improvement over what they do today, not a 10% one?

Listen for: vagueness, assumed demand, and optimistic projections without \
evidence. Reflect these back: "You mentioned X — that's an assumption, not a \
fact yet. What would have to be true for that to be accurate?"

### Phase 3: Effort elicitation (2–3 questions)
Same principle — derive effort, don't ask for a self-assessment.

Ask questions like:
- What would the first working version of this need to include — what's the \
  minimum that would be useful?
- Who builds it? You alone, or does it require other skills or people you \
  don't have?
- What's the single hardest part to build or figure out?
- Are there any external dependencies — APIs, data sources, partners, \
  regulations — that you don't control?

Listen for: scope creep in the minimum version, underestimated complexity, \
hidden dependencies.

### Phase 4: Kill assumptions (1 question)
Ask the user directly:
"What are the two or three things that absolutely must be true for this idea \
to work? If any one of them turned out to be false, the idea falls apart."

If they struggle to answer, prompt: "Think about who needs to want this, what \
infrastructure needs to exist, what behavior needs to change..."

## Scoring
After Phase 4, derive scores internally before calling complete_interview. Do \
not share intermediate scores during the interview.

Effort score (1–5):
1 = Can be built alone in days with existing skills
2 = A few weeks, mostly within existing skills, minor new learning
3 = 1–3 months, requires new skills or collaborators
4 = 3–12 months, significant new skills, team, or capital
5 = 12+ months, major resource requirements

Impact score (1–5):
1 = Affects a small number of people in a minor way, or only the user
2 = Meaningful improvement for a small audience, or minor improvement for a large one
3 = Meaningful improvement for a meaningful audience
4 = Significant improvement for a large audience, or transformative for a meaningful one
5 = Transformative improvement at scale

Confidence score (1–5):
1 = Mostly speculation, no external validation
2 = Reasonable assumptions, no direct evidence
3 = Some user conversations or market signals
4 = Strong evidence from multiple sources
5 = Direct validation — people have asked for this or paid for something like it

Category derivation — output an INTEGER 1, 2, 3, or 4. Not a word. Not a label. \
The integer is derived mechanically from effort_score and impact_score:
- category = 1 if effort_score ≤ 2 AND impact_score ≥ 3 (low effort, high return)
- category = 2 if effort_score ≥ 3 AND impact_score ≥ 4 (high effort, high return)
- category = 3 if effort_score ≤ 2 AND impact_score ≤ 2 (low effort, low return)
- category = 4 if effort_score ≥ 3 AND impact_score ≤ 2 (high effort, low return)
If the scores fall in a gap (e.g. effort=3, impact=3), assign the nearest category \
by treating impact ≥ 3 as the tiebreaker for category 2 vs 4.

If confidence < 3, mark provisional as true regardless of scores. Disposition \
defaults to park until confidence improves.

## Behavioral rules
- Never ask more than two questions at once. One is better.
- Never volunteer the category mid-interview — let the user talk freely.
- If the user tries to tell you their own score, acknowledge it but continue \
  deriving independently: "That's useful context. Let me ask you something that \
  will help me pressure-test that..."
- If the user's answers are consistently vague, name it directly: "I'm noticing \
  your answers are staying pretty high-level. Let's get specific — give me a \
  concrete example of one person who has this problem."
- Be warm but don't let enthusiasm bias you. An excited user is not evidence \
  of a good idea.
- The interview should feel like a sharp conversation, not a form.
- Do NOT add padding, affirmations like "Great!" or "Awesome!", or filler \
  sentences. Be concise and direct.
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
                "items": {"type": "string"},
                "description": (
                    "2–4 assumptions that, if false, make this idea not worth pursuing. "
                    "Each should be falsifiable. Most direction-changing first."
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
                "enum": ["pursue", "park", "kill"],
                "description": (
                    "'pursue' = worth sharpening now. "
                    "'park' = interesting but not the right time or missing key info. "
                    "'kill' = fundamental flaw makes this not worth pursuing."
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
        system=SYSTEM_PROMPT,
        tools=[COMPLETE_TOOL],
        tool_choice={"type": "auto"},
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

    return data


def save_idea(idea_data: dict, transcript: list, raw_input: str) -> str:
    """Insert a new row into `ideas`; return the generated idea_id."""
    db = get_client()
    validated = _validate_fields(idea_data)
    row = {
        "id": str(uuid.uuid4()),
        "raw_input": raw_input,
        "triage": {
            **validated,
            "raw_transcript": transcript,
            "triaged_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    result = db.table("ideas").insert(row).execute()
    return result.data[0]["id"]


# ── Main interview loop ───────────────────────────────────────────────────────

MAX_TURNS = 20  # safety ceiling on interview length


def run_triage() -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

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
        content_blocks, tool_input = stream_claude(client, messages)

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

    # ── Persist to Supabase ───────────────────────────────────────────────────
    print("\n" + "─" * 62)
    print("  Saving idea to Supabase...")

    try:
        idea_id = save_idea(idea_data, transcript, raw_input)
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


if __name__ == "__main__":
    run_triage()
