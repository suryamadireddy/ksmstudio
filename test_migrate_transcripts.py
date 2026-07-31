"""Regression tests for migrate_transcripts service-role migration."""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# db/config import env at module load
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-role-key")

from migrate_transcripts import main, migrate_transcripts  # noqa: E402


class _Result:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error


def _chain(execute_result: _Result) -> MagicMock:
    """Build a fluent mock that terminates in execute() -> result."""
    terminal = MagicMock()
    terminal.execute.return_value = execute_result
    # Every intermediate call returns the same terminal so
    # table().select().not_.is_().execute() and table().insert().execute() work.
    node = MagicMock()
    node.select.return_value = node
    node.not_ = node
    node.is_.return_value = node
    node.insert.return_value = node
    node.execute.return_value = execute_result
    return node


class MigrateTranscriptsTests(unittest.TestCase):
    def test_migrates_unpublished_idea_transcript(self) -> None:
        """Unpublished ideas must be migrated (anon RLS would hide them)."""
        idea = {
            "id": "idea-unpublished",
            "triage": {
                "raw_transcript": [
                    {"role": "user", "content": "hello"},
                    {"role": "assistant", "content": "hi"},
                ],
                "triaged_at": "2026-04-01T00:00:00+00:00",
            },
        }

        db = MagicMock()
        ideas_table = _chain(_Result(data=[idea]))
        conversations_table = _chain(_Result(data=[{"id": "c1"}]))
        messages_table = _chain(_Result(data=[{"id": "m1"}]))

        def table(name: str):
            return {
                "ideas": ideas_table,
                "conversations": conversations_table,
                "messages": messages_table,
            }[name]

        db.table.side_effect = table

        migrated, skipped = migrate_transcripts(db)

        self.assertEqual(migrated, 1)
        self.assertEqual(skipped, 0)
        conversations_table.insert.assert_called_once()
        conv_row = conversations_table.insert.call_args.args[0]
        self.assertEqual(conv_row["idea_id"], "idea-unpublished")
        self.assertEqual(conv_row["context"], "triage")
        self.assertEqual(messages_table.insert.call_count, 2)

    def test_skips_ideas_without_transcript(self) -> None:
        db = MagicMock()
        ideas_table = _chain(
            _Result(data=[{"id": "idea-1", "triage": {"category": "pursue"}}])
        )
        db.table.return_value = ideas_table

        migrated, skipped = migrate_transcripts(db)

        self.assertEqual(migrated, 0)
        self.assertEqual(skipped, 1)
        # Only the ideas select should have run — no conversation inserts.
        self.assertEqual(db.table.call_count, 1)

    def test_aborts_on_select_error(self) -> None:
        db = MagicMock()
        ideas_table = _chain(_Result(data=None, error="permission denied"))
        db.table.return_value = ideas_table

        with self.assertRaises(RuntimeError) as ctx:
            migrate_transcripts(db)
        self.assertIn("Selecting ideas", str(ctx.exception))

    def test_aborts_on_insert_error(self) -> None:
        idea = {
            "id": "idea-1",
            "triage": {
                "raw_transcript": [{"role": "user", "content": "x"}],
            },
        }
        db = MagicMock()
        ideas_table = _chain(_Result(data=[idea]))
        conversations_table = _chain(
            _Result(data=None, error="new row violates row-level security")
        )

        def table(name: str):
            return {
                "ideas": ideas_table,
                "conversations": conversations_table,
            }[name]

        db.table.side_effect = table

        with self.assertRaises(RuntimeError) as ctx:
            migrate_transcripts(db)
        self.assertIn("Inserting conversation", str(ctx.exception))

    def test_main_uses_service_client_not_anon(self) -> None:
        service = MagicMock()
        anon = MagicMock()

        with (
            patch("migrate_transcripts.get_service_client", return_value=service) as svc,
            patch("migrate_transcripts.migrate_transcripts", return_value=(0, 0)) as migrate,
            patch.dict(
                "sys.modules",
                # Ensure a hypothetical get_client import is not what main uses.
            ),
        ):
            # Also patch db.get_client if somehow referenced
            with patch("db.get_client", return_value=anon):
                main()

        svc.assert_called_once_with()
        migrate.assert_called_once_with(service)
        anon.table.assert_not_called()


if __name__ == "__main__":
    unittest.main()
