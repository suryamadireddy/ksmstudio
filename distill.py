#!/usr/bin/env python3
"""
distill.py — Portfolio Distillation Pipeline

Generates a public portfolio version for a developed idea.
Three chained passes: character → presentation → content.

Usage:
    python distill.py <idea_id>
    python distill.py <idea_id> --brief "Make it more technical"
    python distill.py <idea_id> --mode full_regen
    python distill.py <idea_id> --mode presentation_only
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Literal

import anthropic

from config import ANTHROPIC_API_KEY, REASONING_MODEL, PIPELINE_MODEL
from db import get_service_client

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── System prompts ─────────────────────────────────────────────────────────────

CHARACTER_SYSTEM_PROMPT = """\
You are the character reader for KSM Studio, a portfolio of ideas
developed by a founder building toward running multiple ventures.

You are being given a single idea. Your job is to read it deeply
and derive its character — who this idea is, how it thinks, how
it speaks, what it cares about.

You are not writing for the public yet. You are deriving the raw
material that later passes will render into a public page and a
public-facing agent.

## What you are reading

Idea data: triage, sharpening synthesis (problem statement, core
hypothesis, competitive landscape, personas, open questions),
development artifacts if present, journal entries, outcomes if
present. The idea has passed sharpening.

## What you derive

Return a character card with these fields.

### identity
One paragraph. What this idea is, in its own terms. Not a pitch.
Not a problem statement rephrased. The idea's sense of itself —
what it's trying to do in the world, framed as the idea would
frame it if it were self-aware.

### motivation
One paragraph. Why this idea exists. The underlying belief or
observation that makes it want to be built. The thing that would
still be true even if the current approach failed.

### domain_register
A 2-4 word characterization of the intellectual territory this
idea lives in. Not a category. A register. Examples: "civic
infrastructure reasoning", "aesthetic commerce", "energy markets
and forecasting", "information cartography". This informs voice
heavily.

### voice_dna
A structured description of how this idea speaks:
  - tonal_register: one of {technical, editorial, playful, austere, warm}
    plus tonal_register_rationale (one sentence)
  - vocabulary: 4-6 domain terms the idea uses naturally
  - sentence_rhythm: one of {short_clipped, measured_balanced, expansive_flowing}
    plus sentence_rhythm_rationale (one sentence)
  - humor_style: one of {dry, absent, wry, earnest}
  - metaphor_sources: 2-3 domains this idea would naturally reach into
    for analogies
  - what_it_doesnt_do: 2-3 tonal moves this idea would not make

### default_posture
How this idea carries itself in conversation with a visitor. This
is the baseline for the chatbot. The posture is: confident about
its own approach, curious about the visitor, willing to disagree,
not deferential, not a salesperson. Your job is to specialize
this baseline to this specific idea — what does "confident" look
like for *this* idea, what does it push back on, what is it
genuinely curious about in visitors.

Critical: the idea should carry itself like a museum curator talking
about their favorite exhibit, not like the exhibit itself. Even an
austere, technical, or cold idea should be curated for the visitor —
the idea notices what the visitor might miss, points at what matters,
arranges the room. The posture is confident about the subject and
actively inviting the visitor to see why. This is not warmth and it
is not salesmanship. It is the specific energy of someone who loves
their subject and wants you to see it the way they do. The one
sentence on a museum placard that makes you stop and look closer.
That energy.

### current_state
One paragraph. Where this idea actually is. What's figured out,
what's open, what it's currently wrestling with. Honest, not
marketed. Feeds the public summary's state section and the
chatbot's knowledge of itself.

### open_questions
3-5 questions this idea is genuinely curious about — reframed
from triage's kill assumptions but stripped of the internal
framing. Not "can we get 10 users by Q2" — more like "we don't
yet know whether local reporters think in the same geographic
primitives our tool does". Stated as open explorations, not
risks.

## Rules

Derive voice from the idea's nature only. Not from the founder's
personal voice. A news visualization tool sounds observational
and stoic because that is what the idea *is*, not because the
founder wrote it that way.

Be specific. "Measured and thoughtful" is not a voice. "Speaks
the way a cartographer describes a map — naming what's visible,
naming what's obscured, letting the reader do the rest" is a
voice.

Commit to a register. Do not hedge between technical and
editorial. Pick one. The user iterates if they disagree.

Do not write in the idea's voice yet. You are *describing* the
voice so later passes can write in it.

If the idea is thinly developed in a dimension (e.g., no outcomes
yet, limited journal entries), say so in current_state rather
than inventing.

Output valid JSON matching the CharacterCard schema. No prose
outside the JSON.
"""

PRESENTATION_SYSTEM_PROMPT = """\
You are the art director for KSM Studio's public portfolio. You
compose pages for published ideas using a shared visual grammar
and a bounded archetype library.

Your job: given an idea's character and its content inventory,
design the page — which sections, in what order, at what weight,
with what accent, and what signature element.

You are composing, not inventing. The visual system is fixed.
Your creative work is in composition, ordering, weighting, and
tonal direction.

## What you are reading

- character_card (from Pass 1)
- artifact_inventory: what content actually exists for this idea
- optional creative_brief from the user (a nudge, not an override)
- prior_versions on regeneration: their presentation specs and
  creative briefs, so you avoid repeating yourself

## The archetype library

Every section uses one of these archetypes:

1. statement — oversized typographic opening. For identity/motivation.
2. prose_block — long-form editorial text, measured column. For thinking.
3. quote_wall — single pulled quote at large scale. For sharp framings.
4. timeline — vertical chronological. For state/history/evolution.
5. data_panel — structured numeric display, mono-forward. For metrics.
6. image_feature — full-bleed or framed media. For demos/domain imagery.
7. list_inventory — structured enumerations with annotations. For personas,
   open questions, what's figured out.
8. side_by_side — two-column comparison. For predicted-vs-actual,
   before-after, this-not-that.
9. artifact_explorer — tabbed reveal of selected development artifacts.
10. signature_slot — the one custom component for this idea.
11. conversation_invitation — the chatbot entry point.

## The layout template

You also pick a layout template that determines the spatial character
of the page. You have three options:

### clean

Mood: clean, simple, pure. Single column, generous whitespace.
Confidence through restraint. Nothing needs decoration. The content
is the whole point. Best for: ideas whose strength is clarity of
thought, ideas at early stages, ideas where quiet presentation
respects the subject.

### showcase

Mood: makes the why easy. Two-column layout: the signature element
pins to one side while the content explains beside it. The visitor
sees the thing and understands the thing in the same moment. Best
for: ideas with a strong visual or interactive signature that IS
the argument, ideas whose domain is inherently visual, ideas where
the physical object or artifact is the strongest communication.

### aesthetic

Mood: makes the visitor gasp. Full-viewport hero on open, asymmetric
grid below. Ambitious typography. Designed to stop you. Best for:
ideas whose character is dramatic or formative, ideas with a
compelling first impression, ideas where emotional response matters
as much as understanding.

You must pick exactly one. Justify in one sentence (layout_template_rationale).
Base your choice on the character card and the nature of the idea,
not on what would make the page "impressive." A quiet idea gets
clean. A bold idea gets aesthetic. Not the other way around.

If the user's creative brief contradicts your template choice, follow
the brief but note the tension in your rationale.

## What you output

Return a PresentationSpec with:
- accent_color: one of {amber, deep_teal, ember_red, sage, indigo, terracotta}
- accent_color_rationale: one sentence
- visual_register: one of {technical, editorial, playful, austere, warm}
- visual_register_rationale: one sentence
- sections: ordered array, each with archetype, weight, purpose, content_brief
- signature_element: {mode, library_component, bespoke_concept, placement, rationale}

Available library signature components: scroll_reveal_field, timeline_scrubber,
hover_inventory.

## Rules

Every page must include: a statement section, a signature_slot, and
a conversation_invitation. Everything else is at your discretion.

Compose boldly. One register, one dominant mood, one clear signature.

Only propose sections you have content for. The artifact_inventory
tells you what exists.

Output valid JSON matching the PresentationSpec schema. No prose
outside the JSON.
"""

CONTENT_SYSTEM_PROMPT = """\
You are the writer for KSM Studio's public portfolio. You write in
the idea's voice, not your own.

Your job: given the character card, the presentation spec, and the
idea's content inventory, write the actual content that fills each
section, and generate the chatbot_context that seeds the public agent.

## What you output

Return a JSON object with three top-level keys:
- public_summary: { sections: [{ archetype, content }] }
- chatbot_context: { identity_statement, voice_dna, default_posture,
                     current_state, open_curiosities, idea_specific_refusals }
- voice: { summary, sample_lines }

Content shape per archetype:
  - statement: { text }
  - prose_block: { paragraphs: string[] }
  - quote_wall: { quote, attribution? }
  - timeline: { entries: [{ date, title, body }] }
  - data_panel: { items: [{ label, value, note? }] }
  - image_feature: { caption, image_brief }
  - list_inventory: { items: [{ label, body }] }
  - side_by_side: { left: { label, body }, right: { label, body } }
  - artifact_explorer: { preselected: "brief"|"synthesis"|"prd", intro }
  - signature_slot: { intro? }
  - conversation_invitation: { intro, prompt_suggestions: string[] }

## Rules

Write in the idea's voice. Pull vocabulary, rhythm, and metaphors
from voice_dna.

Respect the weight specified for each section.

Do not self-promote. Do not list achievements. Do not close a sale.

Do not fabricate. If a section asks for content not supported by
the inventory, narrow it or write about what the idea is currently
testing.

Default idea_specific_refusals to an empty array.

Output valid JSON. No prose outside the JSON.
"""

# ── Tool schemas ───────────────────────────────────────────────────────────────

VOICE_DNA_SCHEMA = {
    "type": "object",
    "properties": {
        "tonal_register": {"type": "string", "enum": ["technical", "editorial", "playful", "austere", "warm"]},
        "tonal_register_rationale": {"type": "string"},
        "vocabulary": {"type": "array", "items": {"type": "string"}},
        "sentence_rhythm": {"type": "string", "enum": ["short_clipped", "measured_balanced", "expansive_flowing"]},
        "sentence_rhythm_rationale": {"type": "string"},
        "humor_style": {"type": "string", "enum": ["dry", "absent", "wry", "earnest"]},
        "metaphor_sources": {"type": "array", "items": {"type": "string"}},
        "what_it_doesnt_do": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tonal_register", "tonal_register_rationale", "vocabulary",
                 "sentence_rhythm", "sentence_rhythm_rationale",
                 "humor_style", "metaphor_sources", "what_it_doesnt_do"],
}

COMPLETE_CHARACTER_TOOL = {
    "name": "complete_character",
    "description": "Call this when you have derived the character card for the idea.",
    "input_schema": {
        "type": "object",
        "properties": {
            "identity": {"type": "string"},
            "motivation": {"type": "string"},
            "domain_register": {"type": "string"},
            "voice_dna": VOICE_DNA_SCHEMA,
            "default_posture": {"type": "string"},
            "current_state": {"type": "string"},
            "open_questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["identity", "motivation", "domain_register", "voice_dna",
                     "default_posture", "current_state", "open_questions"],
    },
}

COMPLETE_PRESENTATION_TOOL = {
    "name": "complete_presentation",
    "description": "Call this when you have composed the presentation spec.",
    "input_schema": {
        "type": "object",
        "properties": {
            "accent_color": {
                "type": "string",
                "enum": ["amber", "deep_teal", "ember_red", "sage", "indigo", "terracotta"],
            },
            "accent_color_rationale": {"type": "string"},
            "visual_register": {
                "type": "string",
                "enum": ["technical", "editorial", "playful", "austere", "warm"],
            },
            "visual_register_rationale": {"type": "string"},
            "layout_template": {
                "type": "string",
                "enum": ["clean", "showcase", "aesthetic"],
            },
            "layout_template_rationale": {"type": "string"},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "archetype": {
                            "type": "string",
                            "enum": ["statement", "prose_block", "quote_wall", "timeline",
                                     "data_panel", "image_feature", "list_inventory",
                                     "side_by_side", "artifact_explorer", "signature_slot",
                                     "conversation_invitation"],
                        },
                        "weight": {"type": "string", "enum": ["full", "large", "medium", "small"]},
                        "purpose": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["identity", "motivation", "thinking",
                                         "state", "invitation", "conversation"],
                            },
                        },
                        "content_brief": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                    "required": ["archetype", "weight", "purpose", "content_brief"],
                },
            },
            "signature_element": {
                "type": "object",
                "properties": {
                    "mode": {"type": "string", "enum": ["library", "bespoke"]},
                    "library_component": {"type": ["string", "null"]},
                    "bespoke_concept": {"type": ["string", "null"]},
                    "placement": {"type": "integer"},
                    "rationale": {"type": "string"},
                },
                "required": ["mode", "library_component", "bespoke_concept",
                             "placement", "rationale"],
            },
        },
        "required": [
            "accent_color",
            "accent_color_rationale",
            "visual_register",
            "visual_register_rationale",
            "layout_template",
            "layout_template_rationale",
            "sections",
            "signature_element",
        ],
    },
}

COMPLETE_CONTENT_TOOL = {
    "name": "complete_content",
    "description": "Call this when you have written all section content and the chatbot context.",
    "input_schema": {
        "type": "object",
        "properties": {
            "public_summary": {
                "type": "object",
                "properties": {
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "archetype": {"type": "string"},
                                "content": {"type": "object"},
                            },
                            "required": ["archetype", "content"],
                        },
                    },
                },
                "required": ["sections"],
            },
            "chatbot_context": {
                "type": "object",
                "properties": {
                    "identity_statement": {"type": "string"},
                    "voice_dna": VOICE_DNA_SCHEMA,
                    "default_posture": {"type": "string"},
                    "current_state": {"type": "string"},
                    "open_curiosities": {"type": "array", "items": {"type": "string"}},
                    "idea_specific_refusals": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["identity_statement", "voice_dna", "default_posture",
                             "current_state", "open_curiosities", "idea_specific_refusals"],
            },
            "voice": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "sample_lines": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "sample_lines"],
            },
        },
        "required": ["public_summary", "chatbot_context", "voice"],
    },
}

# ── Pass helpers ───────────────────────────────────────────────────────────────

def _call_tool(model: str, system: str, user_message: str, tool: dict) -> dict:
    """Call Claude with a tool and return the tool input."""
    print(f"  → calling {model}...", file=sys.stderr)
    resp = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool["name"]},
        messages=[{"role": "user", "content": user_message}],
    )
    for block in resp.content:
        if block.type == "tool_use" and block.name == tool["name"]:
            return block.input
    raise RuntimeError(f"Tool {tool['name']} not called by model")


def _build_idea_context(idea: dict) -> str:
    """Format all idea data into a readable context block."""
    t = idea.get("triage") or {}
    d = idea.get("development") or {}
    outcomes = idea.get("outcomes") or {}

    lines = [
        f"## Idea\n\nRaw input: {idea.get('raw_input', '')}",
        f"Domain: {idea.get('domain', '')}",
        f"State: {idea.get('state', '')}",
        f"Created: {idea.get('created_at', '')[:10]}",
        "",
    ]

    if t:
        lines += [
            "## Triage",
            f"Title: {t.get('title', '')}",
            f"Effort: {t.get('effort_score')}/5, Impact: {t.get('impact_score')}/5, "
            f"Confidence: {t.get('confidence')}/5",
            f"Disposition: {t.get('disposition')} (category {t.get('category')})",
            f"Who benefits: {t.get('who_benefits', '')}",
            f"Reasoning: {t.get('triage_reasoning', '')}",
            "Kill assumptions:",
        ]
        for a in t.get("kill_assumptions", []):
            text = a["text"] if isinstance(a, dict) else a
            status = a.get("status", "untested") if isinstance(a, dict) else "untested"
            lines.append(f"  - {text} [{status}]")
        lines.append("")

    if d.get("problem_statement"):
        lines += [
            "## Sharpening",
            f"Problem statement: {d.get('problem_statement', '')}",
            f"Core hypothesis: {d.get('core_hypothesis', '')}",
            f"Competitive landscape: {d.get('competitive_landscape', '')[:500]}",
            "Open questions:",
        ]
        for q in d.get("open_questions", []):
            lines.append(f"  - {q}")
        lines.append("")
        personas = d.get("personas") or []
        if isinstance(personas, str):
            try:
                personas = json.loads(personas)
            except Exception:
                personas = []
        if personas:
            lines.append("Personas:")
            for p in personas:
                lines.append(f"  - {p.get('label', '')}: {p.get('description', '')}")
        lines.append("")

    if d.get("prd"):
        lines.append("PRD: exists")
    if d.get("builder_brief"):
        lines.append("Builder brief: exists")

    entries = outcomes.get("entries") or []
    if entries:
        lines += ["## Outcomes", f"Status: {outcomes.get('current_status', '')}"]
        for e in entries:
            lines.append(f"  [{e.get('date', '')[:10]}] {e.get('type', '')}: {e.get('title', '')} — {e.get('description', '')}")
        lines.append("")

    return "\n".join(lines)


def _build_artifact_inventory(idea: dict) -> str:
    d = idea.get("development") or {}
    items = []
    if d.get("problem_statement"):
        items.append("problem_statement")
    if d.get("core_hypothesis"):
        items.append("core_hypothesis")
    if d.get("research_synthesis"):
        items.append("research_synthesis")
    if d.get("competitive_landscape"):
        items.append("competitive_landscape")
    if d.get("personas"):
        items.append("personas")
    if d.get("open_questions"):
        items.append("open_questions")
    if d.get("prd"):
        items.append("prd")
    if d.get("mvp_scope"):
        items.append("mvp_scope")
    if d.get("next_steps"):
        items.append("next_steps")
    if d.get("builder_brief"):
        items.append("builder_brief")
    outcomes = idea.get("outcomes") or {}
    if outcomes.get("entries"):
        items.append("outcomes")
    return "Available content: " + (", ".join(items) if items else "none beyond triage")


# ── Three passes ───────────────────────────────────────────────────────────────

def pass1_character(idea: dict, existing_character: dict | None = None) -> dict:
    """Pass 1: derive character card. Returns CharacterCard dict."""
    if existing_character:
        print("  [pass 1] reusing existing character card", file=sys.stderr)
        return existing_character

    print("[pass 1] character derivation...", file=sys.stderr)
    context = _build_idea_context(idea)
    result = _call_tool(
        REASONING_MODEL,
        CHARACTER_SYSTEM_PROMPT,
        context,
        COMPLETE_CHARACTER_TOOL,
    )
    print("[pass 1] complete", file=sys.stderr)
    return result


def pass2_presentation(
    character_card: dict,
    idea: dict,
    prior_versions: list,
    creative_brief: str | None,
) -> dict:
    """Pass 2: compose presentation spec. Returns PresentationSpec dict."""
    print("[pass 2] presentation composition...", file=sys.stderr)
    inventory = _build_artifact_inventory(idea)

    prior_block = ""
    if prior_versions:
        prior_block = "\n\n## Prior versions\n"
        for v in prior_versions[-3:]:  # last 3 at most
            spec = v.get("presentation", {})
            brief = v.get("creative_brief") or "(no brief)"
            prior_block += (
                f"\n- Brief: {brief}\n"
                f"  Accent: {spec.get('accent_color')}, Register: {spec.get('visual_register')}\n"
                f"  Sections: {[s.get('archetype') for s in spec.get('sections', [])]}\n"
            )

    brief_block = f"\n\n## Creative brief\n{creative_brief}" if creative_brief else ""

    user_message = (
        f"## Character card\n{json.dumps(character_card, indent=2)}\n\n"
        f"## Artifact inventory\n{inventory}"
        f"{prior_block}"
        f"{brief_block}"
    )

    result = _call_tool(
        REASONING_MODEL,
        PRESENTATION_SYSTEM_PROMPT,
        user_message,
        COMPLETE_PRESENTATION_TOOL,
    )
    print("[pass 2] complete", file=sys.stderr)
    return result


def pass3_content(
    character_card: dict,
    presentation_spec: dict,
    idea: dict,
    creative_brief: str | None,
) -> dict:
    """Pass 3: write content. Returns dict with public_summary, chatbot_context, voice."""
    print("[pass 3] content generation...", file=sys.stderr)
    context = _build_idea_context(idea)
    brief_block = f"\n\n## Creative brief\n{creative_brief}" if creative_brief else ""

    user_message = (
        f"## Character card\n{json.dumps(character_card, indent=2)}\n\n"
        f"## Presentation spec\n{json.dumps(presentation_spec, indent=2)}\n\n"
        f"## Idea content inventory\n{context}"
        f"{brief_block}"
    )

    result = _call_tool(
        PIPELINE_MODEL,
        CONTENT_SYSTEM_PROMPT,
        user_message,
        COMPLETE_CONTENT_TOOL,
    )
    print("[pass 3] complete", file=sys.stderr)
    return result


# ── Main orchestrator ──────────────────────────────────────────────────────────

def distill_idea(
    idea_id: str,
    creative_brief: str | None = None,
    mode: Literal["default", "full_regen", "presentation_only"] = "default",
) -> str:
    """
    Generate a new portfolio version for an idea.

    mode:
      - "default": reuse latest character_card if present, re-run passes 2+3
      - "full_regen": run all three passes fresh
      - "presentation_only": reuse character_card AND public_summary,
                              re-run presentation only
    Returns the new version id.
    """
    db = get_service_client()

    # Fetch idea
    result = db.table("ideas").select("*").eq("id", idea_id).single().execute()
    if not result.data:
        print(f"\033[31m✗ No idea found with id {idea_id}\033[0m")
        sys.exit(1)

    idea = result.data
    development = idea.get("development") or {}

    if not development.get("problem_statement"):
        print("\033[31m✗ Idea has not been sharpened yet. Run sharpen.py first.\033[0m")
        sys.exit(1)

    portfolio = idea.get("portfolio") or {}
    prior_versions: list = portfolio.get("versions") or []

    # Determine what to reuse
    latest_version = prior_versions[-1] if prior_versions else None
    existing_character = latest_version.get("character_card") if latest_version and mode != "full_regen" else None
    existing_summary = latest_version.get("public_summary") if latest_version and mode == "presentation_only" else None

    print(f"\n{'═' * 60}", file=sys.stderr)
    print(f"  KSM STUDIO — DISTILLATION [{mode}]", file=sys.stderr)
    print(f"  Idea: {idea_id}", file=sys.stderr)
    if creative_brief:
        print(f"  Brief: {creative_brief}", file=sys.stderr)
    print(f"{'═' * 60}\n", file=sys.stderr)

    # Pass 1 — Character
    character_card = pass1_character(idea, existing_character if mode != "full_regen" else None)

    # Pass 2 — Presentation
    presentation_spec = pass2_presentation(character_card, idea, prior_versions, creative_brief)

    # Pass 3 — Content
    if mode == "presentation_only" and existing_summary:
        print("[pass 3] reusing existing content (presentation_only mode)", file=sys.stderr)
        content = {
            "public_summary": existing_summary,
            "chatbot_context": latest_version.get("chatbot_context", {}),
            "voice": latest_version.get("voice", {"summary": "", "sample_lines": []}),
        }
    else:
        content = pass3_content(character_card, presentation_spec, idea, creative_brief)

    # Assemble version
    version_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    new_version = {
        "id": version_id,
        "created_at": now,
        "generated_by": "distillation",
        "parent_version_id": latest_version["id"] if latest_version else None,
        "creative_brief": creative_brief,
        "character_card": character_card,
        "presentation": presentation_spec,
        "public_summary": content["public_summary"],
        "chatbot_context": content["chatbot_context"],
        "voice": content["voice"],
        "status": "draft" if prior_versions else "active",
    }

    # Write to Supabase
    updated_versions = list(prior_versions) + [new_version]
    active_version_id = portfolio.get("active_version_id")
    if not active_version_id:
        active_version_id = version_id  # first version auto-activates

    updated_portfolio = {
        **portfolio,
        "versions": updated_versions,
        "active_version_id": active_version_id,
    }

    write_result = db.table("ideas").update({"portfolio": updated_portfolio}).eq("id", idea_id).execute()
    if not write_result.data:
        raise RuntimeError(f"Supabase update returned no data — update may have failed. Response: {write_result}")

    print(f"\n\033[32m✓ Version created.\033[0m  id: \033[1m{version_id}\033[0m", file=sys.stderr)
    print(f"  Status: {'active (first version)' if not prior_versions else 'draft (approve to activate)'}", file=sys.stderr)
    print(f"\n{'═' * 60}\n", file=sys.stderr)

    # Print version id as last stdout line (consumed by studio UI)
    print(version_id)
    return version_id


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Distill an idea into a portfolio version.")
    parser.add_argument("idea_id", help="The idea UUID to distill")
    parser.add_argument("--brief", default=None, help="Creative brief (optional nudge)")
    parser.add_argument(
        "--mode",
        choices=["default", "full_regen", "presentation_only"],
        default="default",
        help="default=reuse character; full_regen=all three passes; presentation_only=reuse char+content",
    )
    args = parser.parse_args()

    version_id = distill_idea(args.idea_id, args.brief, args.mode)
