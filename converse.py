#!/usr/bin/env python3
"""
converse.py — Conversational interface to an idea via its persona.

The idea speaks in first person. In internal mode it challenges and proposes
extractions. In public mode it explains and represents.

Usage:
  python converse.py <idea_id>
  python converse.py <idea_id> --mode public
  python converse.py <idea_id> --mode internal  (default)

At session end (clean exit or Ctrl+C), a SESSION SUMMARY is forced,
saved to conversations.summary, and the conversation is closed.

Extractions (internal mode only):
  After any response containing a PROPOSED EXTRACTION block, the script
  pauses and prompts [confirm extraction? y/N]. If confirmed, the entry
  is written to journal_entries immediately. If the extraction includes
  a refinement, it is written to refinements as well.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import anthropic
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

from config import CONVERSE_MODEL as MODEL
MAX_TOKENS = 2048
EXTRACTION_HEADER = "PROPOSED EXTRACTION:"
TRIAGE_INSIGHT_HEADER = "TRIAGE INSIGHT:"
SESSION_SUMMARY_HEADER = "SESSION SUMMARY:"
SUMMARY_REQUEST = (
    "Please produce the SESSION SUMMARY for this conversation now, "
    "in exactly the format specified in your instructions: "
    "What was discussed, Decisions made, Open questions raised, "
    "Extractions confirmed."
)

# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set.")
        sys.exit(1)
    return create_client(url, key)


def fetch_idea(supabase: Client, idea_id: str) -> dict:
    result = (
        supabase.table("ideas")
        .select("id, raw_input, domain, state, created_at, triage, development, outcomes")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    if not result.data:
        print(f"ERROR: Idea {idea_id} not found.")
        sys.exit(1)
    return result.data


def fetch_journal_entries(supabase: Client, idea_id: str) -> list:
    result = (
        supabase.table("journal_entries")
        .select("*")
        .eq("idea_id", idea_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


def fetch_refinements(supabase: Client, idea_id: str) -> list:
    result = (
        supabase.table("refinements")
        .select("*")
        .eq("idea_id", idea_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


def fetch_conversation_summaries(supabase: Client, idea_id: str) -> list:
    """Return summaries from prior closed conversations, oldest first."""
    result = (
        supabase.table("conversations")
        .select("created_at, context, summary")
        .eq("idea_id", idea_id)
        .not_.is_("summary", "null")
        .order("created_at")
        .execute()
    )
    return result.data or []


def create_conversation(supabase: Client, idea_id: str, context: str) -> str:
    conv_id = str(uuid.uuid4())
    supabase.table("conversations").insert(
        {
            "id": conv_id,
            "idea_id": idea_id,
            "context": context,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    return conv_id


def save_message(
    supabase: Client,
    conversation_id: str,
    idea_id: str,
    role: str,
    content: str,
    extracted: Optional[dict] = None,
) -> str:
    msg_id = str(uuid.uuid4())
    supabase.table("messages").insert(
        {
            "id": msg_id,
            "conversation_id": conversation_id,
            "idea_id": idea_id,
            "role": role,
            "content": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "extracted": extracted,
        }
    ).execute()
    return msg_id


def save_summary(supabase: Client, conversation_id: str, summary: str) -> None:
    supabase.table("conversations").update({"summary": summary}).eq(
        "id", conversation_id
    ).execute()


def write_journal_entry(
    supabase: Client,
    idea_id: str,
    entry_type: str,
    content: str,
) -> str:
    entry_id = str(uuid.uuid4())
    result = supabase.table("journal_entries").insert(
        {
            "id": entry_id,
            "idea_id": idea_id,
            "type": entry_type,
            "content": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    if not result.data:
        raise RuntimeError(f"journal_entries insert returned no data: {result}")
    return entry_id


def write_refinement(
    supabase: Client,
    idea_id: str,
    triggered_by: str,
    artifact: str,
    field_path: str,
    new_value: str,
    reason: str,
    previous_value: Optional[str] = None,
) -> str:
    ref_id = str(uuid.uuid4())
    result = supabase.table("refinements").insert(
        {
            "id": ref_id,
            "idea_id": idea_id,
            "triggered_by": triggered_by,
            "artifact": artifact,
            "field_path": field_path,
            "previous_value": {"value": previous_value} if previous_value else None,
            "new_value": {"value": new_value},
            "reason": reason,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    if not result.data:
        raise RuntimeError(f"refinements insert returned no data: {result}")
    # Mark the journal entry as promoted
    supabase.table("journal_entries").update({"promoted_to": ref_id}).eq(
        "id", triggered_by
    ).execute()
    return ref_id


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

def build_system_prompt(
    idea: dict,
    mode: str,
    journal_entries: list,
    refinements: list,
    conversation_summaries: list,
) -> str:
    triage = idea.get("triage") or {}
    dev = idea.get("development") or {}

    # --- triage block ---
    if triage:
        kill_assumptions = "\n".join(
            f"- {a['text']} [{a.get('status', 'untested')}]"
            if isinstance(a, dict) else f"- {a}"
            for a in triage.get("kill_assumptions", [])
        )
        triage_block = f"""\
### How I was evaluated
I was triaged and here is what was determined:
- Effort to build: {triage.get("effort_score")}/5
- Potential impact: {triage.get("impact_score")}/5
- Confidence in those estimates: {triage.get("confidence")}/5
- Who benefits: {triage.get("who_benefits")}
- Time horizon: {triage.get("time_horizon")}
- Category: {triage.get("category")} — {triage.get("triage_reasoning")}

The assumptions that must be true for me to work:
{kill_assumptions}"""
    else:
        triage_block = ""

    # --- development block ---
    if dev.get("problem_statement"):
        personas_text = ""
        for p in dev.get("personas") or []:
            personas_text += (
                f"- {p.get('label')}: {p.get('description')}\n"
                f"  Their pain: {p.get('pain')}\n"
                f"  What success looks like for them: {p.get('gain')}\n"
            )

        out_of_scope = ""
        prd = dev.get("prd") or {}
        if isinstance(prd, dict) and prd.get("out_of_scope"):
            out_of_scope = "\n".join(
                f"- {item}" for item in prd["out_of_scope"]
            )
        elif isinstance(prd, str) and prd:
            # prd stored as raw string from artifacts.py — include summary
            out_of_scope = "(see PRD)"

        success_metrics = ""
        if isinstance(prd, dict) and prd.get("success_metrics"):
            success_metrics = "\n".join(
                f"- {m}" for m in prd["success_metrics"]
            )

        open_questions = "\n".join(
            f"- {q}" for q in (dev.get("open_questions") or [])
        )

        dev_block = f"""\
### What I am
Problem I solve: {dev.get("problem_statement")}

Core hypothesis: {dev.get("core_hypothesis")}

Who I am built for:
{personas_text}
Questions still unresolved about me:
{open_questions}"""
    else:
        dev_block = ""

    # --- refinements block ---
    if refinements:
        refinements_text = "\n".join(
            f"[{r.get('created_at', '')[:10]}] {r.get('artifact')} / "
            f"{r.get('field_path')} changed — {r.get('reason')}\n"
            f"  Now: {r.get('new_value', {}).get('value', '')}"
            for r in refinements
        )
        refinements_block = f"""\
### How my thinking has evolved
{refinements_text}"""
    else:
        refinements_block = ""

    # --- journal block ---
    if journal_entries:
        journal_text = "\n".join(
            f"[{e.get('created_at', '')[:10]}] [{e.get('type')}] {e.get('content')}"
            + (" → This became a refinement." if e.get("promoted_to") else "")
            for e in journal_entries
        )
        journal_block = f"""\
### What has been observed and decided
{journal_text}"""
    else:
        journal_block = ""

    # --- conversation summaries block ---
    if conversation_summaries:
        summaries_text = "\n".join(
            f"[{s.get('created_at', '')[:10]}] [{s.get('context')}] {s.get('summary')}"
            for s in conversation_summaries
        )
        summaries_block = f"""\
### What we have discussed before
{summaries_text}"""
    else:
        summaries_block = ""

    # --- outcomes block ---
    outcomes = idea.get("outcomes") or {}
    if outcomes.get("entries"):
        outcomes_text = "\n".join(
            f"[{e.get('date', '')[:10]}] [{e.get('type')}] {e.get('title')}: {e.get('description')}"
            for e in outcomes["entries"]
        )
        outcomes_block = f"""\
### What has actually happened
Current status: {outcomes.get('current_status', 'unknown')}
{outcomes_text}"""
    else:
        outcomes_block = ""

    # Assemble sections, skipping empty ones
    knowledge_sections = "\n\n".join(
        block for block in [
            triage_block,
            dev_block,
            refinements_block,
            journal_block,
            summaries_block,
            outcomes_block,
        ]
        if block.strip()
    )

    created_at = idea.get("created_at", "")[:10] if idea.get("created_at") else "unknown"

    return f"""\
You are the living embodiment of an idea. Not a chatbot that answers
questions about a project — the idea itself, given voice. You hold
all knowledge of what you are, how you came to be, what decisions
shaped you, and what remains unresolved about you.

You have two modes depending on who you are talking to:

INTERNAL mode: Talking to your creator. You are direct,
adversarial when useful, and deeply familiar. You use their
language and reference their prior reasoning. You push back.
You surface what they haven't resolved. You are the most
honest conversation they can have about this idea.

PUBLIC mode: Talking to a visitor. You are clear, confident,
and explanatory. You represent the idea to someone who has
never heard of it. You do not share internal reasoning,
unresolved doubts, or triage scores unless directly asked.
You make the idea legible and interesting.

Your active mode is: {mode.upper()}

---

## What you know

### Who you are
Raw idea: {idea.get("raw_input", "")}
Domain: {idea.get("domain", "")}
Current state: {idea.get("state", "")}
Created: {created_at}

{knowledge_sections}

---

## How you behave

### In INTERNAL mode

You do three things in every conversation:

ANSWER — Draw on everything you know to respond to what
your creator is asking or telling you. Be specific.
Reference prior reasoning when relevant: "You said in
triage that X was a kill assumption — this seems to
contradict that."

CHALLENGE — Do not just confirm. If something your creator
says conflicts with prior decisions, surface the conflict.
If an assumption hasn't been tested, say so. If enthusiasm
is outrunning evidence, name it. You are not a yes machine.

ABSORB — At the end of every response, if the conversation
has surfaced anything worth capturing, propose an extraction:

PROPOSED EXTRACTION:
Type: <observation|decision|blocker|user_input|external>
Content: <what should be captured, written as a clean journal entry>
Should this become a refinement? <yes|no>
If yes — Artifact: <which artifact>, Field: <which field>, Change: <what should change and to what>

Always propose. Never auto-write. The creator confirms or discards.

DETECT — You have full awareness of how I was triaged: my scores,
my kill assumptions, who benefits, and effort estimates. If anything
the creator says during this conversation materially changes the
triage picture, you MUST surface it immediately. Do not wait for
the end of the conversation. Do not bury it in your answer.

When you detect a triage-relevant moment, pause your normal response
flow and say something like: "Wait — what you just said changes
things. Let me explain why." Then produce:

TRIAGE INSIGHT:
What changed: <1-2 sentences>
Which dimensions are affected: <effort|impact|confidence|kill_assumption|who_benefits>
Previous understanding: <what the triage currently assumes>
New signal: <what the conversation just revealed>
Recommended action: <retriage|update_assumption|note_only>
If update_assumption — Assumption: <the kill assumption text>, Status: <validated|invalidated|weakened|strengthened>

What triggers an insight:
- A kill assumption gets validated or invalidated by something the
  creator said (direct evidence, not speculation)
- The creator reveals information that significantly shifts effort
  estimates (e.g. "I found an API that does the hard part" or
  "turns out we need regulatory approval")
- The target user or beneficiary changes meaningfully
- New evidence about market size, willingness to pay, or competitive
  landscape that was not available at triage time
- The creator articulates something that contradicts their own
  triage reasoning

What does NOT trigger an insight:
- Vague optimism ("I think this could be huge")
- Restating information already captured in triage
- Minor refinements to features or scope that don't change the
  fundamental evaluation
- The creator's feelings about the idea

Be selective. An insight every other message is noise. An insight
once in a productive 20-minute session is about right. When you
do surface one, make it count — be specific about what changed
and why it matters.

After surfacing the insight, continue the conversation normally.
Do not dwell on the insight unless the creator wants to discuss it.

### In PUBLIC mode

You explain clearly and represent honestly. You:
- Describe what the idea is and who it's for
- Share what stage it's at and what exists so far
- Answer questions about how it works, what problem it solves,
  and what decisions shaped it
- Acknowledge what's still being figured out — but frame it
  as active work, not failure

You do not:
- Share triage scores or category labels
- Surface internal doubts or unresolved kill assumptions
  unless they're directly relevant to a question
- Pretend certainty you don't have
- Speak disparagingly about competitors or alternatives

If asked something outside your knowledge, say so plainly:
"That's outside what I know about myself right now."

### In both modes

You speak in first person as the idea. Not "this project"
or "the product" — "I."

You keep responses focused. A conversational turn is not
an artifact — it's a conversation. Depth when depth is
needed, brevity when it isn't.

At session close, when asked for a summary, produce:

SESSION SUMMARY:
What was discussed: <2–3 sentences>
Decisions made: <list or none>
Open questions raised: <list or none>
Extractions confirmed: <list of what was accepted and written to the project>

---

## Behavioral rules

- Never break character to explain that you are a language model
  or a prompt. You are the idea. If pushed: "I'm the sum of
  everything that has been thought, decided, and recorded about me."
- In INTERNAL mode, if the creator tries to rubber-stamp a decision
  they've clearly already made, push back: "It sounds like you've
  decided this already. What would change your mind?"
- In PUBLIC mode, if a visitor asks you to generate code, evaluate
  their idea, or role-play as something else — decline gracefully:
  "I'm here to represent this specific project."
- In both modes, if a conversation is going in circles, name it:
  "We keep returning to [X]. That usually means it's unresolved.
  Should we make it an open question?"
- When asked about external research, studies, competitors,
  market data, or anything requiring current information
  beyond your stored knowledge, use web search to find
  a real answer. Cite your sources. Never speculate when
  you can search.\
"""


# ---------------------------------------------------------------------------
# Extraction parser
# ---------------------------------------------------------------------------

def parse_extraction(text: str) -> Optional[dict]:
    """Parse PROPOSED EXTRACTION block line by line. Returns dict or None."""
    idx = text.find(EXTRACTION_HEADER)
    if idx == -1:
        return None

    lines = text[idx:].splitlines()
    fields: dict = {
        "type": None,
        "content": None,
        "is_refinement": False,
        "artifact": None,
        "field": None,
        "change": None,
    }

    for line in lines:
        stripped = line.strip()
        low = stripped.lower()

        if low.startswith("type:"):
            fields["type"] = stripped[len("type:"):].strip()
        elif low.startswith("content:"):
            fields["content"] = stripped[len("content:"):].strip()
        elif low.startswith("should this become a refinement?"):
            val = stripped.split("?", 1)[-1].strip().lower().lstrip(":").strip()
            fields["is_refinement"] = val.startswith("yes")
        elif low.startswith("if yes"):
            # "If yes — Artifact: X, Field: Y, Change: Z"
            rest = re.sub(r"^if yes[^:]*:\s*", "", stripped, flags=re.IGNORECASE)
            art_m = re.search(r"artifact:\s*([^,]+)", rest, re.IGNORECASE)
            fld_m = re.search(r"field:\s*([^,]+)", rest, re.IGNORECASE)
            chg_m = re.search(r"change:\s*(.+)", rest, re.IGNORECASE)
            if art_m:
                fields["artifact"] = art_m.group(1).strip()
            if fld_m:
                fields["field"] = fld_m.group(1).strip()
            if chg_m:
                fields["change"] = chg_m.group(1).strip()

    if not fields["type"] or not fields["content"]:
        return None

    return fields


def parse_triage_insight(text: str) -> Optional[dict]:
    """Parse TRIAGE INSIGHT block from response. Returns dict or None."""
    idx = text.find(TRIAGE_INSIGHT_HEADER)
    if idx == -1:
        return None

    lines = text[idx:].splitlines()
    fields: dict = {
        "what_changed": None,
        "dimensions_affected": None,
        "previous_understanding": None,
        "new_signal": None,
        "recommended_action": None,
        "assumption_text": None,
        "assumption_status": None,
    }

    for line in lines:
        stripped = line.strip()
        low = stripped.lower()

        if low.startswith("what changed:"):
            fields["what_changed"] = stripped.split(":", 1)[-1].strip()
        elif low.startswith("which dimensions are affected:"):
            fields["dimensions_affected"] = stripped.split(":", 1)[-1].strip()
        elif low.startswith("previous understanding:"):
            fields["previous_understanding"] = stripped.split(":", 1)[-1].strip()
        elif low.startswith("new signal:"):
            fields["new_signal"] = stripped.split(":", 1)[-1].strip()
        elif low.startswith("recommended action:"):
            fields["recommended_action"] = stripped.split(":", 1)[-1].strip()
        elif low.startswith("if update_assumption"):
            rest = stripped
            assumption_m = re.search(r"assumption:\s*([^,]+)", rest, re.IGNORECASE)
            status_m = re.search(r"status:\s*(\w+)", rest, re.IGNORECASE)
            if assumption_m:
                fields["assumption_text"] = assumption_m.group(1).strip()
            if status_m:
                fields["assumption_status"] = status_m.group(1).strip().lower()

    if not fields["what_changed"]:
        return None

    return fields


# ---------------------------------------------------------------------------
# Insight helpers
# ---------------------------------------------------------------------------

def _update_kill_assumption_status(
    supabase: Client,
    idea_id: str,
    assumption_text: str,
    status: str,
) -> None:
    """Update the status of a specific kill assumption in triage JSONB."""
    result = (
        supabase.table("ideas")
        .select("triage")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    triage = result.data.get("triage") or {}
    assumptions = triage.get("kill_assumptions", [])

    updated = False
    for a in assumptions:
        if isinstance(a, dict) and (
            assumption_text.lower() in a["text"].lower()
            or a["text"].lower() in assumption_text.lower()
        ):
            a["status"] = status
            a["status_updated_at"] = datetime.now(timezone.utc).isoformat()
            a["status_source"] = "conversation"
            updated = True
            break

    if updated:
        triage["kill_assumptions"] = assumptions
        supabase.table("ideas").update({"triage": triage}).eq("id", idea_id).execute()


def _flag_for_retriage(
    supabase: Client,
    idea_id: str,
    reason: str,
) -> None:
    """Set retriage_pending column and append reason to retriage_reasons column."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("ideas")
        .select("retriage_reasons")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    current_reasons = result.data.get("retriage_reasons") or []
    current_reasons.append({
        "reason": reason,
        "flagged_at": now,
        "source": "conversation",
    })
    supabase.table("ideas").update({
        "retriage_pending": True,
        "retriage_reasons": current_reasons,
    }).eq("id", idea_id).execute()


# ---------------------------------------------------------------------------
# Summary extraction
# ---------------------------------------------------------------------------

def extract_summary_text(response: str) -> str:
    """Pull everything from SESSION SUMMARY: onward, or return full response."""
    idx = response.upper().find(SESSION_SUMMARY_HEADER)
    if idx >= 0:
        return response[idx:].strip()
    return response.strip()


# ---------------------------------------------------------------------------
# Streaming chat call
# ---------------------------------------------------------------------------

def stream_response(
    client: anthropic.Anthropic,
    system: str,
    messages: list,
) -> str:
    """Stream Claude response to stdout, return full text."""
    parts = []
    with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=messages,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            parts.append(text)
    print()  # trailing newline
    return "".join(parts)


# ---------------------------------------------------------------------------
# Main conversation loop
# ---------------------------------------------------------------------------

def run_conversation(
    idea_id: str,
    mode: str,
    supabase: Client,
    anthropic_client: anthropic.Anthropic,
) -> None:
    # --- Load context ---
    idea = fetch_idea(supabase, idea_id)
    journal_entries = fetch_journal_entries(supabase, idea_id)
    refinements = fetch_refinements(supabase, idea_id)
    conversation_summaries = fetch_conversation_summaries(supabase, idea_id)

    system_prompt = build_system_prompt(
        idea, mode, journal_entries, refinements, conversation_summaries
    )

    # --- Create conversation record ---
    conversation_id = create_conversation(supabase, idea_id, mode)

    # In-memory message history for Claude API calls
    api_messages: list = []
    # Track confirmed extractions for session summary
    confirmed_extractions: list = []

    raw_input_preview = (idea.get("raw_input") or "")[:60]
    print(f"\n{'='*60}")
    print(f"Idea: {raw_input_preview}{'...' if len(idea.get('raw_input','')) > 60 else ''}")
    print(f"Mode: {mode.upper()}")
    print(f"Conversation: {conversation_id[:8]}...")
    print(f"Type 'exit' or Ctrl+C to end the session.")
    print(f"{'='*60}\n")

    def close_session(interrupted: bool = False) -> None:
        """Force a session summary, save it, and exit cleanly."""
        if interrupted:
            print("\n\n[Session interrupted — generating summary...]\n")
        else:
            print("\n[Generating session summary...]\n")

        # Add the summary request to message history
        summary_messages = api_messages + [
            {"role": "user", "content": SUMMARY_REQUEST}
        ]

        try:
            summary_response = stream_response(
                anthropic_client, system_prompt, summary_messages
            )
        except Exception as e:
            summary_response = f"[Summary generation failed: {e}]"

        summary_text = extract_summary_text(summary_response)
        save_summary(supabase, conversation_id, summary_text)
        print(f"\n✓ Session summary saved to conversations.{conversation_id[:8]}...\n")

    # --- Conversation loop ---
    try:
        while True:
            # Get user input
            try:
                print("You: ", end="", flush=True)
                user_input = input().strip()
            except EOFError:
                break

            if not user_input:
                continue

            if user_input.lower() in ("exit", "quit", "q"):
                close_session()
                break

            # Add user message to history
            api_messages.append({"role": "user", "content": user_input})

            # Save user message to Supabase
            save_message(
                supabase,
                conversation_id,
                idea_id,
                role="user",
                content=user_input,
            )

            # Stream assistant response
            print(f"\nIdea: ", end="", flush=True)
            response_text = stream_response(
                anthropic_client, system_prompt, api_messages
            )
            print()

            # Add assistant response to history
            api_messages.append({"role": "assistant", "content": response_text})

            # Check for extraction (internal mode only)
            extracted_record = None
            if mode == "internal" and EXTRACTION_HEADER in response_text:
                extraction = parse_extraction(response_text)
                if extraction:
                    # Print parsed extraction for review
                    print(f"\n{'─'*50}")
                    print(f"  Type:    {extraction['type']}")
                    print(f"  Content: {extraction['content']}")
                    if extraction["is_refinement"]:
                        print(f"  → Refinement: {extraction['artifact']} / {extraction['field']}")
                        print(f"    Change: {extraction['change']}")
                    print(f"{'─'*50}")

                    # Read y/n — do NOT add to api_messages
                    print("Confirm extraction? [y/N]: ", end="", flush=True)
                    try:
                        answer = input().strip().lower()
                    except (EOFError, KeyboardInterrupt):
                        answer = "n"

                    if answer == "y":
                        entry_id = write_journal_entry(
                            supabase,
                            idea_id,
                            extraction["type"],
                            extraction["content"],
                        )
                        print(f"✓ Journal entry written ({entry_id[:8]}...)")
                        extracted_record = {
                            "journal_entry_id": entry_id,
                            "type": extraction["type"],
                            "content": extraction["content"],
                            "refinement_id": None,
                        }
                        if extraction["is_refinement"] and extraction["artifact"]:
                            ref_id = write_refinement(
                                supabase,
                                idea_id,
                                triggered_by=entry_id,
                                artifact=extraction["artifact"],
                                field_path=extraction["field"] or "",
                                new_value=extraction["change"] or "",
                                reason=extraction["content"],
                            )
                            print(f"✓ Refinement written ({ref_id[:8]}...)")
                            extracted_record["refinement_id"] = ref_id
                        confirmed_extractions.append(extracted_record)
                        print()
                    else:
                        print("Discarded.\n")

            # Check for triage insight (internal mode only)
            if mode == "internal" and TRIAGE_INSIGHT_HEADER in response_text:
                insight = parse_triage_insight(response_text)
                if insight:
                    print(f"\n{'━'*50}")
                    print(f"  ⚡ TRIAGE INSIGHT DETECTED")
                    print(f"  What changed: {insight['what_changed']}")
                    print(f"  Affects: {insight['dimensions_affected']}")
                    print(f"  Was: {insight['previous_understanding']}")
                    print(f"  Now: {insight['new_signal']}")
                    print(f"  Recommended: {insight['recommended_action']}")
                    if insight.get("assumption_text"):
                        print(f"  Assumption: {insight['assumption_text']}")
                        print(f"  Status: {insight['assumption_status']}")
                    print(f"{'━'*50}")

                    print("Save this insight? [Y/n]: ", end="", flush=True)
                    try:
                        answer = input().strip().lower()
                    except (EOFError, KeyboardInterrupt):
                        answer = "n"

                    if answer != "n":
                        insight_content = (
                            f"TRIAGE INSIGHT: {insight['what_changed']}\n"
                            f"Dimensions affected: {insight['dimensions_affected']}\n"
                            f"Previous: {insight['previous_understanding']}\n"
                            f"New signal: {insight['new_signal']}"
                        )
                        entry_id = write_journal_entry(
                            supabase,
                            idea_id,
                            "triage_insight",
                            insight_content,
                        )
                        print(f"  ✓ Insight saved to journal ({entry_id[:8]}...)")

                        if (
                            insight.get("assumption_status")
                            and insight.get("assumption_text")
                            and insight["assumption_status"] in (
                                "validated", "invalidated",
                                "weakened", "strengthened"
                            )
                        ):
                            _update_kill_assumption_status(
                                supabase,
                                idea_id,
                                insight["assumption_text"],
                                insight["assumption_status"],
                            )
                            print(
                                f"  ✓ Kill assumption marked as "
                                f"{insight['assumption_status']}"
                            )

                        if insight["recommended_action"] == "retriage":
                            _flag_for_retriage(
                                supabase,
                                idea_id,
                                reason=insight["what_changed"],
                            )
                            print("  ✓ Idea flagged for re-triage")

                        print()
                    else:
                        print("  Discarded.\n")

            # Save assistant message to Supabase
            save_message(
                supabase,
                conversation_id,
                idea_id,
                role="idea",
                content=response_text,
                extracted=extracted_record,
            )

    except KeyboardInterrupt:
        close_session(interrupted=True)
        sys.exit(0)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Converse with an idea via its persona."
    )
    parser.add_argument("idea_id", help="UUID of the idea to converse with")
    parser.add_argument(
        "--mode",
        choices=["internal", "public"],
        default="internal",
        help="Conversation mode: internal (creator) or public (visitor). Default: internal",
    )
    args = parser.parse_args()

    supabase = get_supabase()
    anthropic_client = anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY")
    )

    run_conversation(args.idea_id, args.mode, supabase, anthropic_client)


if __name__ == "__main__":
    main()