import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonAllowingLineComments,
  stripJsonLineComments,
} from "./parse.ts";

describe("stripJsonLineComments", () => {
  it("preserves https:// and http:// inside JSON strings", () => {
    const input =
      '{"feature": "Sign in via https://auth.example.com/oauth", "docs": "http://example.com"}';
    assert.equal(stripJsonLineComments(input), input);
  });

  it("removes real // comments outside strings", () => {
    const input = '{\n  // Claude note\n  "a": 1, // trailing\n  "b": 2\n}';
    const stripped = stripJsonLineComments(input);
    assert.deepEqual(JSON.parse(stripped), { a: 1, b: 2 });
  });

  it("does not treat escaped quotes as ending a string", () => {
    const input = '{"path": "say \\"hi\\" // still in string", "ok": true}';
    assert.equal(stripJsonLineComments(input), input);
  });
});

describe("parseJsonAllowingLineComments", () => {
  it("parses JSON that contains URL strings", () => {
    const value = parseJsonAllowingLineComments(
      '[{"name": "OAuth", "description": "Use https://accounts.google.com"}]'
    );
    assert.deepEqual(value, [
      { name: "OAuth", description: "Use https://accounts.google.com" },
    ]);
  });

  it("parses JSON with line comments and URL strings together", () => {
    const input = `[
      // must feature
      {"name": "Login", "description": "Redirect to https://auth.example.com"}
    ]`;
    assert.deepEqual(parseJsonAllowingLineComments(input), [
      { name: "Login", description: "Redirect to https://auth.example.com" },
    ]);
  });
});
