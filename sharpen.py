#!/usr/bin/env python3
"""
sharpen.py — Idea Sharpening

Takes --idea-id, fetches raw_input + triage from Supabase, runs the
sharpening prompt with web search via Claude, parses the structured output,
and writes it to ideas.development (JSONB).

Usage:
    python sharpen.py --idea-id <uuid>

Writes to `ideas.development` (JSONB):
    {
      "research_synthesis":    str,
      "competitive_landscape": str,
      "problem_statement":     str,
      "core_hypothesis":       str,
      "personas":              list[dict],
      "open_questions":        list[str],
      "sharpened_at":          iso8601
    }
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone

import anthropic

from config import ANTHROPIC_API_KEY, PIPELINE_MODEL as MODEL
from db import get_client

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a product sharpening agent. You receive a raw idea and its completed triage \
object. Your job is to do two things before any artifacts are created:

1. Run a focused web search to ground the idea in reality
2. Produce three core definitional outputs that all subsequent artifacts will build from

Do not produce a PRD, personas, or feature lists. Those come later. Your only job \
is to sharpen the foundation.

## Inputs you will receive
- raw_input: the user's original idea as captured
- triage: the full triage JSON object

## Step 1: Web research (run before producing any output)
Run searches in this specific order. Do not skip any.

Search 1 — Existing solutions:
Query: "[core problem from raw_input] existing solutions OR tools OR apps"
What you're looking for: direct competitors, adjacent solutions, and anything \
that suggests this problem has already been solved well enough that the idea \
needs repositioning.

Search 2 — Demand signals:
Query: "[core problem from raw_input] reddit OR forums OR 'does anyone' OR \
'looking for' OR 'wish there was'"
What you're looking for: real people expressing this problem unprompted. \
This is the most honest demand signal available without user interviews.

Search 3 — Kill assumption validation:
For each kill assumption in the triage object, run a targeted search to find \
any public evidence that confirms or challenges it.
Query format: "[kill assumption stated as a claim] evidence OR data OR research"

Synthesize findings in 3–5 sentences. Be direct about what you found and what \
it means for the idea. If a kill assumption looks empirically shaky, say so \
plainly — do not soften it.

## Step 2: Produce the three definitional outputs

### Output 1: Problem statement
A single, precise paragraph. Must answer four things in order:
- Who specifically has this problem (use language from triage.who_benefits)
- What they currently do without this solution (the workaround)
- Why the workaround is inadequate (the specific friction)
- What a solved world looks like for them

Constraints:
- No solution language. The problem statement describes the world before \
  your idea exists.
- No vague descriptors like "many people" or "significant pain." \
  Be specific or say you don't know yet.
- Maximum 100 words.

### Output 2: Core hypothesis
One sentence. Strict format:

"We believe [specific user] experiences [specific problem] when [specific context]. \
Solving it with [solution approach — not product name] will result in [specific, \
measurable outcome]. We will know this is true when [validation signal]."

The validation signal must be concrete — a behavior, not a feeling. \
"Users return weekly" not "users find it valuable."

### Output 3: Personas
Generate 2 personas maximum. More than two at this stage is false precision — \
you don't have enough information yet.

For each persona:
{
  "label": "<evocative 3-4 word label, not a job title>",
  "description": "<2 sentences: who they are and what their day looks like>",
  "pain": "<the specific friction this idea addresses for them>",
  "gain": "<what success looks like in their own words — write it as if \
            they said it, not as if you're describing them>",
  "proxy_for_real_user": <true|false>
}

proxy_for_real_user is true if this persona is based on a real person \
the user mentioned or a real user type confirmed by your research. \
False if it is inferred. This flag matters — it tells the user how \
much to trust each persona.

## Output format
Produce output in this exact structure:

### Research synthesis
[3–5 sentences, direct and honest]

### Competitive landscape note
[1–2 sentences only: what's the most directly comparable existing solution, \
and what's the key gap your idea addresses that it doesn't. If no direct \
competitor exists, say that plainly.]

### Problem statement
[paragraph, max 100 words]

### Core hypothesis
[single sentence in the specified format]

### Personas
[JSON array of 2 persona objects — raw JSON, no markdown code fence]

### Open questions
[3–5 questions ranked by how much the answer could change direction — \
most direction-changing first. Numbered list.]

## Behavioral rules
- If the web research reveals a direct and well-executed competitor, do not \
  suppress it. Surface it clearly and reframe the open questions around \
  differentiation.
- If a kill assumption is directly contradicted by your research, flag it \
  explicitly in the research synthesis: "Kill assumption [X] appears \
  empirically weak based on [finding]. This should be resolved before \
  development proceeds."
- Do not produce optimistic output to match the user's enthusiasm. \
  A sharpening pass that only confirms what the user already believed \
  is worthless.
- The problem statement and hypothesis are working documents, not final copy. \
  Write them to be challenged and refined, not to sound polished.
"""

# ── Section heading → JSON key mapping ───────────────────────────────────────

SECTION_MAP = {
    "Research synthesis": "research_synthesis",
    "Competitive landscape note": "competitive_landscape",
    "Problem statement": "problem_statement",
    "Core hypothesis": "core_hypothesis",
    "Personas": "personas",
    "Open questions": "open_questions",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_idea(idea_id: str) -> dict:
    """Fetch raw_input and triage from Supabase for the given idea_id."""
    db = get_client()
    result = (
        db.table("ideas")
        .select("raw_input, triage")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    if not result.data:
        print(f"\033[31m✗ No idea found with id {idea_id}\033[0m")
        sys.exit(1)
    return result.data


def build_user_message(raw_input: str, triage: dict) -> str:
    return (
        "## Raw input (user's original idea)\n"
        f"{raw_input}\n\n"
        "## Triage object\n"
        f"{json.dumps(triage, indent=2)}\n\n"
        "Run the sharpening process now. Follow all steps in order: "
        "complete all web searches first, then produce the three definitional outputs. "
        "Format your response exactly as specified."
    )


def stream_sharpening(client: anthropic.Anthropic, user_message: str) -> str:
    """
    Stream the sharpening response to stdout. Returns the final text output.
    Handles pause_turn continuation for long server-side tool loops.
    """
    messages = [{"role": "user", "content": user_message}]
    full_text = ""
    max_continuations = 5

    for _ in range(max_continuations):
        current_text = ""

        with client.messages.stream(
            model=MODEL,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=messages,
        ) as stream:
            for event in stream:
                if event.type == "content_block_start":
                    btype = event.content_block.type
                    if btype == "server_tool_use":
                        print(f"\n\033[90m  🔍  Searching...\033[0m", flush=True)
                    elif btype == "web_search_tool_result":
                        print(f"\033[90m      ✓ results received\033[0m", flush=True)

                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        print(event.delta.text, end="", flush=True)
                        current_text += event.delta.text

            final = stream.get_final_message()

        # Accumulate text from this iteration into full_text
        for block in final.content:
            if block.type == "text":
                full_text += block.text

        if final.stop_reason != "pause_turn":
            print()  # trailing newline
            break

        # pause_turn: append assistant turn and continue
        messages.append({
            "role": "assistant",
            "content": [b.model_dump() for b in final.content],
        })
    else:
        print("\n\033[33m⚠ Hit continuation limit — output may be incomplete.\033[0m")

    print(f"\n\033[90m  Captured {len(full_text):,} characters\033[0m")
    return full_text


def parse_output(text: str) -> dict:
    """
    Parse ### section headings in Claude's output into a dict
    keyed by the SECTION_MAP values.

    Strategy: find each known heading's position in the text, then
    extract the content between it and the next heading. This is more
    robust than splitting on newlines because it doesn't care about
    leading/trailing whitespace or line endings around the headings.
    """
    # ── Print raw response so we can see exactly what Claude returned ─────────
    print(f"\n{'─' * 62}")
    print("  RAW CLAUDE RESPONSE:")
    print(f"{'─' * 62}")
    print(text)
    print(f"{'─' * 62}\n")

    # Build a list of (start_pos, heading_label) for every known heading,
    # matching case-insensitively and tolerating variable whitespace.
    heading_positions: list[tuple[int, str]] = []
    for heading in SECTION_MAP:
        # Match "### <heading>" with any amount of whitespace, anywhere in text
        pattern = r"###\s+" + re.escape(heading)
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            heading_positions.append((m.end(), heading))

    # Sort by position so we can extract content between consecutive headings
    heading_positions.sort(key=lambda x: x[0])

    raw_sections: dict[str, str] = {}
    for i, (content_start, heading) in enumerate(heading_positions):
        content_end = heading_positions[i + 1][0] - len("### ") - len(heading_positions[i + 1][1]) - 10 \
            if i + 1 < len(heading_positions) else len(text)
        # Simpler: just slice from after this heading to the start of the next ### marker
        if i + 1 < len(heading_positions):
            next_start, next_heading = heading_positions[i + 1]
            # Walk back to find the "###" that starts the next heading
            next_marker = text.rfind("###", content_start, next_start)
            content_end = next_marker if next_marker != -1 else next_start
        else:
            content_end = len(text)
        raw_sections[heading] = text[content_start:content_end].strip()

    result: dict = {}
    for heading, key in SECTION_MAP.items():
        content = raw_sections.get(heading, "")

        if key == "personas":
            # Extract JSON from ```json ... ``` fence, or try raw content
            fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
            json_text = fenced.group(1).strip() if fenced else content.strip()
            try:
                result[key] = json.loads(json_text)
            except json.JSONDecodeError:
                result[key] = json_text  # preserve raw if parse fails

        elif key == "open_questions":
            # Extract numbered list items ("1. ...", "2. ..." etc.)
            questions = re.findall(r"^\d+\.\s+(.+)$", content, re.MULTILINE)
            result[key] = questions if questions else [
                q.lstrip("-•* ").strip()
                for q in content.splitlines()
                if q.strip()
            ]

        else:
            result[key] = content

    # ── Print parsed result so we can verify before saving ───────────────────
    print(f"{'─' * 62}")
    print("  PARSED DEVELOPMENT OBJECT:")
    print(f"{'─' * 62}")
    for key, val in result.items():
        if isinstance(val, str):
            preview = val[:120].replace("\n", " ")
            print(f"  {key}: {preview}{'…' if len(val) > 120 else ''}")
        else:
            print(f"  {key}: {json.dumps(val)[:120]}")
    print(f"{'─' * 62}\n")

    return result


def save_development(idea_id: str, development: dict) -> None:
    """Write the development object to ideas.development."""
    db = get_client()
    db.table("ideas").update({"development": development}).eq("id", idea_id).execute()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Sharpen an idea via Claude + web search.")
    parser.add_argument("--idea-id", required=True, help="UUID of the idea to sharpen")
    args = parser.parse_args()
    idea_id: str = args.idea_id

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # ── Fetch ─────────────────────────────────────────────────────────────────
    print(f"\n{'═' * 62}")
    print("  KSM STUDIO — IDEA SHARPENING")
    print(f"{'═' * 62}")
    print(f"  idea_id: {idea_id}")

    idea = fetch_idea(idea_id)
    raw_input: str = idea["raw_input"] or ""
    triage: dict = idea["triage"] or {}

    print(f"  idea:    {triage.get('title', '(no title)')}\n")

    # ── Run sharpening ────────────────────────────────────────────────────────
    user_message = build_user_message(raw_input, triage)
    raw_output = stream_sharpening(client, user_message)

    if not raw_output.strip():
        print("\n\033[31m✗ Claude returned empty output.\033[0m")
        sys.exit(1)

    # ── Parse & save ──────────────────────────────────────────────────────────
    development = parse_output(raw_output)
    development["sharpened_at"] = datetime.now(timezone.utc).isoformat()

    print(f"  Saving to Supabase...")

    try:
        save_development(idea_id, development)
    except Exception as exc:
        print(f"\n\033[31m✗ Save failed:\033[0m {exc}")
        print("\nParsed development object (not saved):")
        print(json.dumps(development, indent=2))
        sys.exit(1)

    # ── Summary ───────────────────────────────────────────────────────────────
    personas = development.get("personas", [])
    n_personas = len(personas) if isinstance(personas, list) else "?"
    open_qs = development.get("open_questions", [])
    n_questions = len(open_qs) if isinstance(open_qs, list) else "?"

    print(f"\n\033[32m✓ Saved.\033[0m  ideas.development written.\n")
    print(f"  Problem statement:  {development.get('problem_statement', '')[:80]}…")
    print(f"  Core hypothesis:    {development.get('core_hypothesis', '')[:80]}…")
    print(f"  Personas:           {n_personas}")
    print(f"  Open questions:     {n_questions}")
    print(f"\n{'═' * 62}")
    print(f"  Next:  python artifacts.py --idea-id {idea_id}")
    print(f"{'═' * 62}\n")


if __name__ == "__main__":
    main()
