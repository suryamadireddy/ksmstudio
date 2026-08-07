"""Unit tests for retriage_reasons append/clear helpers."""

from __future__ import annotations

import unittest

from retriage_utils import (
    append_retriage_reason,
    apply_retriage_clear,
    normalize_retriage_reasons,
)


class NormalizeReasonsTests(unittest.TestCase):
    def test_null_and_invalid(self):
        self.assertEqual(normalize_retriage_reasons(None), [])
        self.assertEqual(normalize_retriage_reasons("x"), [])
        self.assertEqual(normalize_retriage_reasons([1, {"reason": "a"}]), [{"reason": "a"}])

    def test_copies_entries(self):
        original = [{"reason": "a", "flagged_at": "t1"}]
        normalized = normalize_retriage_reasons(original)
        normalized[0]["reason"] = "b"
        self.assertEqual(original[0]["reason"], "a")


class AppendReasonTests(unittest.TestCase):
    def test_appends_without_mutating_input(self):
        current = [{"reason": "old", "flagged_at": "2026-01-01T00:00:00Z", "source": "conversation"}]
        next_reasons = append_retriage_reason(
            current,
            "new signal",
            "2026-01-02T00:00:00Z",
            source="conversation",
        )
        self.assertEqual(len(current), 1)
        self.assertEqual(len(next_reasons), 2)
        self.assertEqual(next_reasons[1]["reason"], "new signal")
        self.assertEqual(next_reasons[1]["flagged_at"], "2026-01-02T00:00:00Z")
        self.assertEqual(next_reasons[1]["source"], "conversation")

    def test_append_on_empty(self):
        next_reasons = append_retriage_reason(None, "first", "t1")
        self.assertEqual(next_reasons, [
            {"reason": "first", "flagged_at": "t1", "source": "conversation"},
        ])


class ClearReasonsTests(unittest.TestCase):
    def test_dismiss_clears_all(self):
        current = [
            {"reason": "a", "flagged_at": "2026-01-01T00:00:00Z"},
            {"reason": "b", "flagged_at": "2026-01-02T00:00:00Z"},
        ]
        remaining, pending = apply_retriage_clear(current, clear_before=None)
        self.assertEqual(remaining, [])
        self.assertFalse(pending)

    def test_retriage_keeps_reasons_flagged_after_start(self):
        started = "2026-01-01T12:00:00Z"
        current = [
            {"reason": "old", "flagged_at": "2026-01-01T11:00:00Z", "source": "conversation"},
            {"reason": "during", "flagged_at": "2026-01-01T13:00:00Z", "source": "conversation"},
            {"reason": "same-instant", "flagged_at": started, "source": "conversation"},
        ]
        remaining, pending = apply_retriage_clear(current, clear_before=started)
        self.assertTrue(pending)
        self.assertEqual([r["reason"] for r in remaining], ["during"])

    def test_retriage_clear_all_when_no_newer(self):
        started = "2026-01-01T12:00:00Z"
        current = [
            {"reason": "old", "flagged_at": "2026-01-01T11:00:00Z", "source": "conversation"},
        ]
        remaining, pending = apply_retriage_clear(current, clear_before=started)
        self.assertEqual(remaining, [])
        self.assertFalse(pending)


if __name__ == "__main__":
    unittest.main()
