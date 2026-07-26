#!/usr/bin/env python3
"""Regression tests for portfolio CAS / activation invariants."""

from __future__ import annotations

import unittest
from typing import Any

from portfolio_activation import resolve_new_version_activation
from portfolio_cas import (
    append_distilled_version,
    cas_append_distilled_version,
    portfolio_version_token,
)


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
        prior = [{"id": "v1", "status": "archived"}]
        status, active_id = resolve_new_version_activation(prior, None, "v2")
        self.assertEqual(status, "draft")
        self.assertIsNone(active_id)


class AppendDistilledVersionTests(unittest.TestCase):
    def test_preserves_publish_metadata_and_concurrent_branch(self) -> None:
        portfolio = {
            "published": True,
            "slug": "first-idea",
            "headline": "Hello",
            "versions": [
                {"id": "v1", "status": "active"},
                {"id": "v1b", "status": "draft"},
            ],
            "active_version_id": "v1",
            "updated_at": "2026-07-25T11:00:00.000Z",
        }
        updated = append_distilled_version(
            portfolio,
            {"id": "v2", "parent_version_id": None, "status": "draft"},
            now="2026-07-25T12:00:00.000Z",
        )
        self.assertEqual(updated["slug"], "first-idea")
        self.assertEqual(updated["headline"], "Hello")
        self.assertTrue(updated["published"])
        self.assertEqual([v["id"] for v in updated["versions"]], ["v1", "v1b", "v2"])
        self.assertEqual(updated["versions"][-1]["status"], "draft")
        self.assertEqual(updated["active_version_id"], "v1")
        self.assertEqual(updated["updated_at"], "2026-07-25T12:00:00.000Z")
        self.assertEqual(updated["versions"][-1]["parent_version_id"], "v1b")

    def test_stale_write_without_retry_would_drop_branch(self) -> None:
        base = {
            "versions": [{"id": "v1", "status": "active"}],
            "active_version_id": "v1",
            "updated_at": "t0",
        }
        after_branch = append_distilled_version(
            base,
            {"id": "v1b", "status": "draft"},
            now="t1",
        )
        stale = append_distilled_version(
            base,
            {"id": "v2", "status": "draft"},
            now="t2",
        )
        self.assertEqual([v["id"] for v in stale["versions"]], ["v1", "v2"])
        retried = append_distilled_version(
            after_branch,
            {"id": "v2", "status": "draft"},
            now="t3",
        )
        self.assertEqual([v["id"] for v in retried["versions"]], ["v1", "v1b", "v2"])
        self.assertNotEqual(
            portfolio_version_token(after_branch),
            portfolio_version_token(retried),
        )


class _FakeQuery:
    def __init__(self, store: dict[str, Any], payload: dict) -> None:
        self._store = store
        self._payload = payload
        self._idea_id: str | None = None
        self._filters: list[tuple[str, Any]] = []

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        if key == "id":
            self._idea_id = value
        else:
            self._filters.append((key, value))
        return self

    def is_(self, key: str, value: Any) -> "_FakeQuery":
        self._filters.append((key, value))
        return self

    def execute(self) -> Any:
        assert self._idea_id is not None
        row = self._store[self._idea_id]
        for key, value in self._filters:
            if key == "portfolio":
                if value == "null" and row.get("portfolio") is not None:
                    return type("R", (), {"data": []})()
            elif key == "portfolio->>updated_at":
                token = portfolio_version_token(row.get("portfolio"))
                if token != value:
                    return type("R", (), {"data": []})()
        row["portfolio"] = self._payload["portfolio"]
        return type("R", (), {"data": [{"id": self._idea_id}]})()


class _FakeTable:
    def __init__(self, store: dict[str, Any]) -> None:
        self._store = store
        self._idea_id: str | None = None

    def select(self, *_cols: str) -> "_FakeTable":
        return self

    def update(self, payload: dict) -> _FakeQuery:
        return _FakeQuery(self._store, payload)

    def eq(self, key: str, value: Any) -> "_FakeTable":
        if key == "id":
            self._idea_id = value
        return self

    def single(self) -> "_FakeTable":
        return self

    def execute(self) -> Any:
        assert self._idea_id is not None
        return type("R", (), {"data": dict(self._store[self._idea_id])})()


class _FakeDB:
    def __init__(self, store: dict[str, Any]) -> None:
        self._store = store

    def table(self, _name: str) -> _FakeTable:
        return _FakeTable(self._store)


class CasAppendTests(unittest.TestCase):
    def test_retries_when_concurrent_writer_changes_token(self) -> None:
        store = {
            "idea-1": {
                "id": "idea-1",
                "portfolio": {
                    "versions": [{"id": "v1", "status": "active"}],
                    "active_version_id": "v1",
                    "updated_at": "t0",
                    "slug": "kept",
                },
            }
        }
        db = _FakeDB(store)
        select_calls = {"n": 0}
        original_execute = _FakeTable.execute

        def flaky_select_execute(self: _FakeTable) -> Any:
            result = original_execute(self)
            select_calls["n"] += 1
            if select_calls["n"] == 1:
                # Concurrent branch lands after the stale read returns.
                store["idea-1"]["portfolio"] = {
                    **store["idea-1"]["portfolio"],
                    "versions": [
                        {"id": "v1", "status": "active"},
                        {"id": "v1b", "status": "draft"},
                    ],
                    "updated_at": "t1",
                }
            return result

        _FakeTable.execute = flaky_select_execute  # type: ignore[method-assign]
        try:
            updated = cas_append_distilled_version(
                db,
                "idea-1",
                {"id": "v2", "parent_version_id": None},
                now_factory=lambda: "t2",
            )
        finally:
            _FakeTable.execute = original_execute  # type: ignore[method-assign]

        self.assertEqual([v["id"] for v in updated["versions"]], ["v1", "v1b", "v2"])
        self.assertEqual(updated["slug"], "kept")
        self.assertEqual(store["idea-1"]["portfolio"]["updated_at"], "t2")


if __name__ == "__main__":
    unittest.main()
