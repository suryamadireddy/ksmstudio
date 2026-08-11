#!/usr/bin/env python3
"""Unit tests for triage category/disposition validation invariants."""

from __future__ import annotations

import unittest

from triage_validate import derive_category, validate_fields


class DeriveCategoryTests(unittest.TestCase):
    def test_pursue(self):
        self.assertEqual(derive_category(2, 4), 1)

    def test_potential(self):
        self.assertEqual(derive_category(4, 5), 2)

    def test_park(self):
        self.assertEqual(derive_category(1, 2), 3)

    def test_discard(self):
        self.assertEqual(derive_category(5, 1), 4)

    def test_gap(self):
        self.assertEqual(derive_category(3, 3), 2)
        self.assertEqual(derive_category(3, 2), 4)


class ValidateFieldsTests(unittest.TestCase):
    def test_overrides_inconsistent_category_and_disposition(self):
        out = validate_fields(
            {
                "effort_score": 5,
                "impact_score": 1,
                "category": 1,
                "disposition": "pursue",
                "time_horizon": "6mo",
                "kill_assumptions": [],
            }
        )
        self.assertEqual(out["category"], 4)
        self.assertEqual(out["disposition"], "discard")

    def test_forces_disposition_from_score_derived_category(self):
        out = validate_fields(
            {
                "effort_score": 2,
                "impact_score": 5,
                "category": 4,
                "disposition": "discard",
                "time_horizon": "immediate",
                "kill_assumptions": [],
            }
        )
        self.assertEqual(out["category"], 1)
        self.assertEqual(out["disposition"], "pursue")

    def test_derives_when_category_missing(self):
        out = validate_fields(
            {
                "effort_score": 1,
                "impact_score": 1,
                "disposition": "pursue",
                "time_horizon": "1yr",
                "kill_assumptions": [],
            }
        )
        self.assertEqual(out["category"], 3)
        self.assertEqual(out["disposition"], "park")

    def test_coerces_string_scores(self):
        out = validate_fields(
            {
                "effort_score": "2",
                "impact_score": "5",
                "category": 4,
                "disposition": "discard",
                "time_horizon": "weeks",
                "kill_assumptions": ["assume demand"],
            }
        )
        self.assertEqual(out["effort_score"], 2)
        self.assertEqual(out["impact_score"], 5)
        self.assertEqual(out["category"], 1)
        self.assertEqual(out["disposition"], "pursue")
        self.assertEqual(out["time_horizon"], "immediate")
        self.assertEqual(
            out["kill_assumptions"],
            [{"text": "assume demand", "status": "untested"}],
        )


if __name__ == "__main__":
    unittest.main()
