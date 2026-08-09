import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRetriageSeedMessage,
  isValidAnthropicMessageOrder,
  mergeSeededMessages,
} from "./retriage-messages.ts";

describe("buildRetriageSeedMessage", () => {
  it("builds a hidden user opener with the idea label", () => {
    const seed = buildRetriageSeedMessage("Portfolio distill");
    assert.equal(seed.role, "user");
    assert.equal(seed.hidden, true);
    assert.match(seed.content, /Portfolio distill/);
  });
});

describe("mergeSeededMessages", () => {
  it("prepends the seed before a streaming assistant placeholder", () => {
    const current = [
      { role: "assistant" as const, content: "", streaming: true },
    ];
    const seeded = [
      { role: "user" as const, content: "I want to re-triage this existing idea." },
    ];
    const merged = mergeSeededMessages(current, seeded);
    assert.deepEqual(
      merged.map((m) => ({ role: m.role, hidden: !!m.hidden, streaming: !!m.streaming })),
      [
        { role: "user", hidden: true, streaming: false },
        { role: "assistant", hidden: false, streaming: true },
      ]
    );
  });

  it("keeps follow-up turns valid for Anthropic after the user replies", () => {
    const afterTurn1 = mergeSeededMessages(
      [{ role: "assistant", content: "What changed?", streaming: false }],
      [{ role: "user", content: "seed" }]
    );
    const turn2 = [
      ...afterTurn1.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: "New evidence on kill assumption 1." },
    ];
    assert.equal(isValidAnthropicMessageOrder(turn2), true);
  });
});

describe("isValidAnthropicMessageOrder", () => {
  it("rejects assistant-first histories (the pre-fix turn-2 payload)", () => {
    assert.equal(
      isValidAnthropicMessageOrder([
        { role: "assistant" },
        { role: "user" },
      ]),
      false
    );
  });

  it("accepts user/assistant/user", () => {
    assert.equal(
      isValidAnthropicMessageOrder([
        { role: "user" },
        { role: "assistant" },
        { role: "user" },
      ]),
      true
    );
  });
});
