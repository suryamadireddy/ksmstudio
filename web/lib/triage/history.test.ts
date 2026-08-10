import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNextUserTurn,
  dropStreamingPlaceholders,
  sanitizeMessagesForAnthropic,
} from "./history.ts";

describe("dropStreamingPlaceholders", () => {
  it("removes incomplete assistant placeholders", () => {
    const out = dropStreamingPlaceholders([
      { role: "user", content: "idea" },
      { role: "assistant", content: "partial", streaming: true },
    ]);
    assert.deepEqual(out, [{ role: "user", content: "idea" }]);
  });
});

describe("buildNextUserTurn", () => {
  it("drops streaming assistant so consecutive users are not posted", () => {
    const out = buildNextUserTurn(
      [
        { role: "user", content: "idea" },
        { role: "assistant", content: "hi", streaming: false },
        { role: "user", content: "more" },
        { role: "assistant", content: "cut off", streaming: true },
      ],
      "retry",
    );
    assert.deepEqual(out, [
      { role: "user", content: "idea" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "more" },
      { role: "user", content: "retry" },
    ]);
    // sanitizeMessagesForAnthropic merges the trailing consecutive users.
    const sanitized = sanitizeMessagesForAnthropic(out);
    assert.deepEqual(sanitized, [
      { role: "user", content: "idea" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "more\n\nretry" },
    ]);
  });

  it("drops empty assistant turns that would 400 Anthropic", () => {
    const out = buildNextUserTurn(
      [
        { role: "user", content: "idea" },
        { role: "assistant", content: "   ", streaming: false },
      ],
      "again",
    );
    assert.deepEqual(out, [
      { role: "user", content: "idea" },
      { role: "user", content: "again" },
    ]);
    assert.deepEqual(sanitizeMessagesForAnthropic(out), [
      { role: "user", content: "idea\n\nagain" },
    ]);
  });
});

describe("sanitizeMessagesForAnthropic", () => {
  it("rejects empty history and assistant-first history", () => {
    assert.equal(sanitizeMessagesForAnthropic([]), null);
    assert.equal(
      sanitizeMessagesForAnthropic([{ role: "assistant", content: "hi" }]),
      null,
    );
  });

  it("rejects history that does not end in user", () => {
    assert.equal(
      sanitizeMessagesForAnthropic([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
      null,
    );
  });

  it("keeps a valid alternating transcript", () => {
    assert.deepEqual(
      sanitizeMessagesForAnthropic([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ]),
      [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
    );
  });
});
