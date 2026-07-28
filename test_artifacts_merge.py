"""Regression tests for artifacts development merge-at-write behavior."""

from __future__ import annotations

import unittest

from development_utils import merge_development_key


class MergeDevelopmentKeyTests(unittest.TestCase):
    def test_preserves_sibling_keys(self) -> None:
        current = {
            "problem_statement": "ps",
            "prd": {"problem": "old"},
            "mvp_scope": {"in": ["a"]},
        }
        next_dev = merge_development_key(current, "prd", {"problem": "new"})
        self.assertEqual(next_dev["problem_statement"], "ps")
        self.assertEqual(next_dev["mvp_scope"], {"in": ["a"]})
        self.assertEqual(next_dev["prd"], {"problem": "new"})

    def test_stale_pre_llm_snapshot_would_drop_siblings(self) -> None:
        stale = {"problem_statement": "ps", "prd": {"problem": "from A start"}}
        fresh = {
            "problem_statement": "ps",
            "prd": {"problem": "from B"},
            "mvp_scope": {"in": ["shipped by B"]},
            "next_steps": {"now": ["by B"]},
        }
        a_prd = {"problem": "from A finish"}

        lost = merge_development_key(stale, "prd", a_prd)
        self.assertNotIn("mvp_scope", lost)

        safe = merge_development_key(fresh, "prd", a_prd)
        self.assertEqual(safe["mvp_scope"], {"in": ["shipped by B"]})
        self.assertEqual(safe["next_steps"], {"now": ["by B"]})
        self.assertEqual(safe["prd"], a_prd)

    def test_null_current_treated_as_empty(self) -> None:
        self.assertEqual(
            merge_development_key(None, "builder_brief", {"x": 1}),
            {"builder_brief": {"x": 1}},
        )


if __name__ == "__main__":
    unittest.main()
