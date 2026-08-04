"""Regression tests for JSON // comment stripping used by artifact parsing."""

from __future__ import annotations

import json
import os
import unittest

# artifacts.py → config.py requires these at import time.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

from artifacts import _parse_field, build_builder_brief_context
from json_utils import loads_json_allowing_line_comments, strip_json_line_comments


class StripJsonLineCommentsTests(unittest.TestCase):
    def test_preserves_https_and_http_inside_strings(self):
        raw = (
            '{"feature": "Sign in via https://auth.example.com/oauth", '
            '"docs": "http://example.com/path"}'
        )
        self.assertEqual(strip_json_line_comments(raw), raw)
        self.assertEqual(
            loads_json_allowing_line_comments(raw)["feature"],
            "Sign in via https://auth.example.com/oauth",
        )

    def test_removes_real_line_comments_outside_strings(self):
        raw = '{\n  // Claude note\n  "a": 1, // trailing\n  "b": 2\n}'
        self.assertEqual(
            loads_json_allowing_line_comments(raw),
            {"a": 1, "b": 2},
        )

    def test_naive_strip_would_corrupt_urls(self):
        """Document the bug: naive // removal truncates URL strings."""
        import re

        raw = '{"url": "https://example.com/path", "count": 1}'
        naive = re.sub(r"//[^\n]*", "", raw)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(naive)
        self.assertEqual(
            loads_json_allowing_line_comments(raw)["url"],
            "https://example.com/path",
        )

    def test_parse_field_preserves_urls_in_fenced_json(self):
        content = """```json
[
  {"name": "OAuth", "description": "Use https://accounts.google.com"}
]
```"""
        parsed = _parse_field(content, "json")
        self.assertIsInstance(parsed, list)
        self.assertEqual(parsed[0]["description"], "Use https://accounts.google.com")

    def test_builder_brief_does_not_character_split_string_mvp_cut(self):
        idea = {
            "raw_input": "test",
            "triage": {},
            "development": {
                "prd": {},
                "mvp_scope": {
                    "mvp_cut": '{"feature": "Sign in via https:',  # corrupted legacy
                    "build_sequence": [],
                },
                "next_steps": {
                    "resolution_actions": "broken",
                },
            },
        }
        ctx = build_builder_brief_context(idea)
        mvp_section = ctx.split("MVP cut (feature names):")[1].split("Build sequence:")[0]
        mvp_bullets = [line for line in mvp_section.splitlines() if line.startswith("- ")]
        self.assertEqual(len(mvp_bullets), 1)
        self.assertIn("Sign in via https:", mvp_bullets[0])

        res_section = ctx.split("Resolution actions:")[1].split("---")[0]
        res_bullets = [line for line in res_section.splitlines() if line.startswith("- ")]
        self.assertEqual(res_bullets, ["- broken"])


if __name__ == "__main__":
    unittest.main()
