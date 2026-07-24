#!/usr/bin/env python3
"""Regression tests for distill version activation invariants."""

from __future__ import annotations

import unittest

from portfolio_activation import resolve_new_version_activation


class ResolveNewVersionActivationTests(unittest.TestCase):
    def test_first_version_auto_activates(self) -> None:
        status, active_id = resolve_new_version_activation([], None, "v1")
        self.assertEqual(status, "active")
        self.assertEqual(active_id, "v1")

    def test_subsequent_version_stays_draft_when_active_exists(self) -> None:
        prior = [{"id": "v1", "status": "active"}]
        status, active_id = resolve_new_version_activation(prior, "v1", "v2")
        self.assertEqual(status, "draft")
        self.assertEqual(active_id, "v1")

    def test_subsequent_version_does_not_claim_cleared_active_pointer(self) -> None:
        # After archiving the active version, active_version_id is null.
        # A regenerated draft must not become the public active pointer.
        prior = [{"id": "v1", "status": "archived"}]
        status, active_id = resolve_new_version_activation(prior, None, "v2")
        self.assertEqual(status, "draft")
        self.assertIsNone(active_id)


if __name__ == "__main__":
    unittest.main()
