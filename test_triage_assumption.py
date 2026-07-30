"""Regression tests for converse triage assumption updates."""

from __future__ import annotations

import unittest

from triage_utils import (
    apply_kill_assumption_status,
    triage_version_token,
)


def base_triage(**overrides):
    triage = {
        "effort_score": 3,
        "impact_score": 4,
        "confidence": 3,
        "time_horizon": "6mo",
        "who_benefits": "operators",
        "kill_assumptions": [
            {"text": "Users will pay for this", "status": "untested"},
            {"text": "Data is available via API", "status": "untested"},
        ],
        "category": 2,
        "provisional": False,
        "triage_reasoning": "solid",
        "disposition": "potential",
        "triage_version": 1,
        "triage_history": [],
    }
    triage.update(overrides)
    return triage


class TriageVersionTokenTests(unittest.TestCase):
    def test_prefers_column(self) -> None:
        self.assertEqual(triage_version_token(5, {"triage_version": 2}), 5)

    def test_falls_back_to_blob_then_one(self) -> None:
        self.assertEqual(triage_version_token(None, {"triage_version": 3}), 3)
        self.assertEqual(triage_version_token(None, {}), 1)


class ApplyKillAssumptionStatusTests(unittest.TestCase):
    def test_updates_match_without_mutating_input(self) -> None:
        current = base_triage()
        updated, triage = apply_kill_assumption_status(
            current,
            "users will pay",
            "invalidated",
            "2026-07-30T12:00:00+00:00",
        )
        self.assertTrue(updated)
        self.assertEqual(current["kill_assumptions"][0]["status"], "untested")
        self.assertEqual(triage["kill_assumptions"][0]["status"], "invalidated")
        self.assertEqual(
            triage["kill_assumptions"][0]["status_source"], "conversation"
        )
        self.assertEqual(triage["effort_score"], 3)

    def test_fresh_retriage_blob_preserves_history_and_scores(self) -> None:
        fresh = base_triage(
            effort_score=5,
            impact_score=5,
            triage_version=2,
            triage_reasoning="retriaged after new signal",
            triage_history=[
                {
                    "effort_score": 3,
                    "triage_version": 1,
                    "kill_assumptions": [
                        {"text": "Users will pay for this", "status": "untested"}
                    ],
                }
            ],
            kill_assumptions=[
                {"text": "Users will pay for this", "status": "untested"},
                {"text": "Enterprise procurement is fast", "status": "untested"},
            ],
        )
        stale = base_triage(effort_score=3, triage_version=1, triage_history=[])

        lost_updated, lost = apply_kill_assumption_status(
            stale,
            "Users will pay for this",
            "weakened",
            "2026-07-30T12:00:00+00:00",
        )
        self.assertTrue(lost_updated)
        self.assertEqual(lost["effort_score"], 3)
        self.assertEqual(lost["triage_history"], [])

        safe_updated, safe = apply_kill_assumption_status(
            fresh,
            "Users will pay for this",
            "weakened",
            "2026-07-30T12:00:00+00:00",
        )
        self.assertTrue(safe_updated)
        self.assertEqual(safe["effort_score"], 5)
        self.assertEqual(safe["triage_reasoning"], "retriaged after new signal")
        self.assertEqual(safe["triage_version"], 2)
        self.assertEqual(len(safe["triage_history"]), 1)
        self.assertEqual(safe["kill_assumptions"][0]["status"], "weakened")

    def test_no_match(self) -> None:
        updated, _ = apply_kill_assumption_status(
            base_triage(),
            "completely unrelated assumption",
            "validated",
            "2026-07-30T12:00:00+00:00",
        )
        self.assertFalse(updated)


if __name__ == "__main__":
    unittest.main()
