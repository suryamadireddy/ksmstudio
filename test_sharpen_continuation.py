"""Regression tests for sharpen.py pause_turn content serialization."""

from __future__ import annotations

import unittest

from anthropic.types import (
    ServerToolUseBlock,
    TextBlock,
    ThinkingBlock,
    WebSearchResultBlock,
    WebSearchToolResultBlock,
)

from anthropic_continuation import serialize_assistant_content_for_continuation


class SerializeAssistantContentTests(unittest.TestCase):
    def test_strips_null_sdk_fields_that_bare_model_dump_keeps(self) -> None:
        thinking = ThinkingBlock(type="thinking", thinking="plan", signature="sig")
        tool_use = ServerToolUseBlock(
            type="server_tool_use",
            id="srvtoolu_1",
            name="web_search",
            input={"query": "market size"},
        )
        result = WebSearchToolResultBlock(
            type="web_search_tool_result",
            tool_use_id="srvtoolu_1",
            content=[
                WebSearchResultBlock(
                    type="web_search_result",
                    url="https://example.com",
                    title="Example",
                    encrypted_content="enc",
                    page_age=None,
                )
            ],
        )
        text = TextBlock(type="text", text="partial answer", citations=None)

        bare = [b.model_dump() for b in (thinking, tool_use, result, text)]
        self.assertIn("caller", bare[1])
        self.assertIsNone(bare[1]["caller"])
        self.assertIn("citations", bare[3])
        self.assertIsNone(bare[3]["citations"])
        self.assertIsNone(bare[2]["content"][0]["page_age"])

        serialized = serialize_assistant_content_for_continuation(
            [thinking, tool_use, result, text]
        )

        self.assertEqual(
            serialized[0],
            {"type": "thinking", "thinking": "plan", "signature": "sig"},
        )
        self.assertEqual(
            serialized[1],
            {
                "type": "server_tool_use",
                "id": "srvtoolu_1",
                "name": "web_search",
                "input": {"query": "market size"},
            },
        )
        self.assertNotIn("caller", serialized[1])
        self.assertEqual(
            serialized[2],
            {
                "type": "web_search_tool_result",
                "tool_use_id": "srvtoolu_1",
                "content": [
                    {
                        "type": "web_search_result",
                        "url": "https://example.com",
                        "title": "Example",
                        "encrypted_content": "enc",
                    }
                ],
            },
        )
        self.assertEqual(serialized[3], {"type": "text", "text": "partial answer"})
        self.assertNotIn("citations", serialized[3])

    def test_dict_blocks_also_drop_nulls(self) -> None:
        serialized = serialize_assistant_content_for_continuation(
            [
                {
                    "type": "server_tool_use",
                    "id": "srvtoolu_2",
                    "name": "web_search",
                    "input": {"query": "x"},
                    "caller": None,
                }
            ]
        )
        self.assertEqual(
            serialized,
            [
                {
                    "type": "server_tool_use",
                    "id": "srvtoolu_2",
                    "name": "web_search",
                    "input": {"query": "x"},
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
