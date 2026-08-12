#!/usr/bin/env python3
"""Tests for distill idea-context assembly (journal + refinements)."""

from __future__ import annotations

import unittest

from distill_context import (
    build_artifact_inventory,
    build_idea_context,
    refinement_new_value,
)


class RefinementNewValueTests(unittest.TestCase):
    def test_dict_value(self):
        self.assertEqual(
            refinement_new_value({"new_value": {"value": "revised framing"}}),
            "revised framing",
        )

    def test_missing_and_plain(self):
        self.assertEqual(refinement_new_value({}), "")
        self.assertEqual(refinement_new_value({"new_value": "plain"}), "plain")


class BuildIdeaContextTests(unittest.TestCase):
    def setUp(self):
        self.idea = {
            "raw_input": "news globe for local reporters",
            "domain": "civic tech",
            "state": "sharpened",
            "created_at": "2026-04-01T12:00:00Z",
            "triage": {
                "title": "GeoNews",
                "effort_score": 3,
                "impact_score": 4,
                "confidence": 3,
                "disposition": "pursue",
                "category": 2,
                "who_benefits": "local reporters",
                "triage_reasoning": "high leverage",
                "kill_assumptions": [{"text": "reporters think geographically", "status": "untested"}],
            },
            "development": {
                "problem_statement": "Reporters lack geographic context",
                "core_hypothesis": "A globe UI improves beat coverage",
                "competitive_landscape": "Existing CMS maps are static",
                "open_questions": ["Will newsrooms pay?"],
                "personas": [{"label": "Beat reporter", "description": "Covers city hall"}],
                "prd": {"solution": "interactive globe"},
            },
            "outcomes": {"current_status": "building", "entries": []},
        }

    def test_omits_journal_and_refinements_when_absent(self):
        text = build_idea_context(self.idea)
        self.assertIn("Problem statement: Reporters lack geographic context", text)
        self.assertNotIn("## Refinements", text)
        self.assertNotIn("## Journal entries", text)

    def test_includes_confirmed_refinement_overlay(self):
        refinements = [
            {
                "created_at": "2026-05-01T10:00:00Z",
                "artifact": "sharpening",
                "field_path": "problem_statement",
                "reason": "Creator reframed after user interview",
                "new_value": {"value": "City-desk editors lack shared geographic primitives"},
            }
        ]
        text = build_idea_context(self.idea, refinements=refinements)
        self.assertIn("## Refinements", text)
        self.assertIn("problem_statement", text)
        self.assertIn("City-desk editors lack shared geographic primitives", text)
        self.assertIn("Creator reframed after user interview", text)

    def test_includes_journal_entries_with_promotion_marker(self):
        journal = [
            {
                "created_at": "2026-05-01T09:00:00Z",
                "type": "decision",
                "content": "Pivot from consumer to newsroom buyers",
                "promoted_to": "ref-1",
            },
            {
                "created_at": "2026-05-02T09:00:00Z",
                "type": "observation",
                "content": "Two editors asked for beat overlays",
                "promoted_to": None,
            },
        ]
        text = build_idea_context(self.idea, journal_entries=journal)
        self.assertIn("## Journal entries", text)
        self.assertIn("Pivot from consumer to newsroom buyers → became a refinement", text)
        self.assertIn("Two editors asked for beat overlays", text)

    def test_concrete_stale_portfolio_trigger(self):
        """Confirmed refinement must appear even when development blob is stale."""
        refinements = [
            {
                "created_at": "2026-06-01T00:00:00Z",
                "artifact": "development",
                "field_path": "core_hypothesis",
                "reason": "Validated with three editors",
                "new_value": {"value": "Editors will adopt if globe embeds in CMS"},
            }
        ]
        text = build_idea_context(self.idea, refinements=refinements)
        # Stale development still present…
        self.assertIn("A globe UI improves beat coverage", text)
        # …but the confirmed overlay must also be visible to distillation passes.
        self.assertIn("Editors will adopt if globe embeds in CMS", text)


class BuildArtifactInventoryTests(unittest.TestCase):
    def test_lists_journal_and_refinements_counts(self):
        idea = {
            "development": {"problem_statement": "x", "prd": {"solution": "y"}},
            "outcomes": {},
        }
        inventory = build_artifact_inventory(
            idea,
            journal_entries=[{"id": "1"}, {"id": "2"}],
            refinements=[{"id": "r1"}],
        )
        self.assertIn("refinements(1)", inventory)
        self.assertIn("journal_entries(2)", inventory)
        self.assertIn("problem_statement", inventory)


if __name__ == "__main__":
    unittest.main()
