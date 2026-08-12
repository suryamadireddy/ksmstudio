"""Pure helpers for assembling distillation idea context.

Kept free of anthropic/config imports so unit tests can run without env.
"""

from __future__ import annotations

import json


def refinement_new_value(refinement: dict) -> str:
    new_value = refinement.get("new_value")
    if isinstance(new_value, dict):
        return str(new_value.get("value", "") or "")
    if new_value is None:
        return ""
    return str(new_value)


def build_idea_context(
    idea: dict,
    journal_entries: list | None = None,
    refinements: list | None = None,
) -> str:
    """Format idea + journal + refinements into a readable context block.

    Journal entries and refinements live in separate tables; callers must
    fetch and pass them. Confirmed refinements are overlays on development
    and are required for accurate portfolio character/content.
    """
    t = idea.get("triage") or {}
    d = idea.get("development") or {}
    outcomes = idea.get("outcomes") or {}
    journal_entries = journal_entries or []
    refinements = refinements or []

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
                if not isinstance(p, dict):
                    continue
                lines.append(f"  - {p.get('label', '')}: {p.get('description', '')}")
        lines.append("")

    if d.get("prd"):
        lines.append("PRD: exists")
    if d.get("builder_brief"):
        lines.append("Builder brief: exists")

    if refinements:
        lines += ["", "## Refinements"]
        for r in refinements:
            created = str(r.get("created_at", "") or "")[:10]
            lines.append(
                f"  [{created}] {r.get('artifact', '')} / {r.get('field_path', '')} "
                f"changed — {r.get('reason', '')}\n"
                f"    Now: {refinement_new_value(r)}"
            )
        lines.append("")

    if journal_entries:
        lines += ["", "## Journal entries"]
        for e in journal_entries:
            created = str(e.get("created_at", "") or "")[:10]
            promoted = " → became a refinement" if e.get("promoted_to") else ""
            lines.append(
                f"  [{created}] [{e.get('type', '')}] {e.get('content', '')}{promoted}"
            )
        lines.append("")

    entries = outcomes.get("entries") or []
    if entries:
        lines += ["## Outcomes", f"Status: {outcomes.get('current_status', '')}"]
        for e in entries:
            lines.append(
                f"  [{e.get('date', '')[:10]}] {e.get('type', '')}: "
                f"{e.get('title', '')} — {e.get('description', '')}"
            )
        lines.append("")

    return "\n".join(lines)


def build_artifact_inventory(
    idea: dict,
    journal_entries: list | None = None,
    refinements: list | None = None,
) -> str:
    d = idea.get("development") or {}
    journal_entries = journal_entries or []
    refinements = refinements or []
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
    if refinements:
        items.append(f"refinements({len(refinements)})")
    if journal_entries:
        items.append(f"journal_entries({len(journal_entries)})")
    outcomes = idea.get("outcomes") or {}
    if outcomes.get("entries"):
        items.append("outcomes")
    return "Available content: " + (", ".join(items) if items else "none beyond triage")
