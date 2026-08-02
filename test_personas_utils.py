"""Regression tests for personas shape normalization."""

from __future__ import annotations

import unittest

from personas_utils import normalize_personas


class NormalizePersonasTests(unittest.TestCase):
    def test_list_of_dicts_passthrough(self) -> None:
        raw = [{"label": "A", "description": "d", "pain": "p", "gain": "g"}]
        self.assertEqual(normalize_personas(raw), raw)

    def test_json_string_parses(self) -> None:
        raw = '[{"label": "A", "description": "d", "pain": "p", "gain": "g"}]'
        self.assertEqual(normalize_personas(raw)[0]["label"], "A")

    def test_unparseable_string_returns_empty(self) -> None:
        # sharpen.py stores the raw section text on JSONDecodeError
        self.assertEqual(normalize_personas("- not json at all"), [])

    def test_single_object_wrapped(self) -> None:
        raw = {"label": "Solo", "description": "d", "pain": "p", "gain": "g"}
        self.assertEqual(normalize_personas(raw)[0]["label"], "Solo")

    def test_single_object_json_string_wrapped(self) -> None:
        raw = '{"label": "Solo", "description": "d"}'
        self.assertEqual(normalize_personas(raw)[0]["label"], "Solo")

    def test_non_dict_entries_filtered(self) -> None:
        raw = [{"label": "A"}, "skip", None, 3]
        self.assertEqual(normalize_personas(raw), [{"label": "A"}])

    def test_none_and_empty(self) -> None:
        self.assertEqual(normalize_personas(None), [])
        self.assertEqual(normalize_personas(""), [])
        self.assertEqual(normalize_personas([]), [])


if __name__ == "__main__":
    unittest.main()
