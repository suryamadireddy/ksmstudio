import unittest

from development_utils import merge_development


class MergeDevelopmentTests(unittest.TestCase):
    def test_preserves_existing_artifacts_and_overwrites_researcher_fields(self) -> None:
        existing = {
            "research_synthesis": "old synthesis",
            "prd": {"solution": "existing PRD"},
            "mvp_scope": {"features": ["keep me"]},
        }
        incoming = {
            "research_synthesis": "new synthesis",
            "open_questions": ["What changed?"],
        }

        merged = merge_development(existing, incoming)

        self.assertEqual(merged["research_synthesis"], "new synthesis")
        self.assertEqual(merged["open_questions"], ["What changed?"])
        self.assertEqual(merged["prd"], {"solution": "existing PRD"})
        self.assertEqual(merged["mvp_scope"], {"features": ["keep me"]})
        self.assertEqual(existing["research_synthesis"], "old synthesis")

    def test_treats_missing_existing_development_as_empty(self) -> None:
        self.assertEqual(
            merge_development(None, {"research_synthesis": "new"}),
            {"research_synthesis": "new"},
        )


if __name__ == "__main__":
    unittest.main()
