import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendRetriageReason,
  applyRetriageClear,
  normalizeRetriageReasons,
} from "./mutate.ts";

describe("normalizeRetriageReasons", () => {
  it("handles null and non-arrays", () => {
    assert.deepEqual(normalizeRetriageReasons(null), []);
    assert.deepEqual(normalizeRetriageReasons("x"), []);
  });

  it("copies entries", () => {
    const original = [{ reason: "a", flagged_at: "t1" }];
    const normalized = normalizeRetriageReasons(original);
    normalized[0].reason = "b";
    assert.equal(original[0].reason, "a");
  });
});

describe("appendRetriageReason", () => {
  it("appends without mutating input", () => {
    const current = [
      { reason: "old", flagged_at: "2026-01-01T00:00:00Z", source: "conversation" },
    ];
    const next = appendRetriageReason(
      current,
      "new signal",
      "2026-01-02T00:00:00Z",
    );
    assert.equal(current.length, 1);
    assert.equal(next.length, 2);
    assert.equal(next[1].reason, "new signal");
    assert.equal(next[1].flagged_at, "2026-01-02T00:00:00Z");
  });
});

describe("applyRetriageClear", () => {
  it("dismiss clears all", () => {
    const { reasons, pending } = applyRetriageClear(
      [
        { reason: "a", flagged_at: "2026-01-01T00:00:00Z" },
        { reason: "b", flagged_at: "2026-01-02T00:00:00Z" },
      ],
      null,
    );
    assert.deepEqual(reasons, []);
    assert.equal(pending, false);
  });

  it("retriage keeps reasons flagged after session start", () => {
    const started = "2026-01-01T12:00:00Z";
    const { reasons, pending } = applyRetriageClear(
      [
        { reason: "old", flagged_at: "2026-01-01T11:00:00Z", source: "conversation" },
        { reason: "during", flagged_at: "2026-01-01T13:00:00Z", source: "conversation" },
        { reason: "same-instant", flagged_at: started, source: "conversation" },
      ],
      started,
    );
    assert.equal(pending, true);
    assert.deepEqual(
      reasons.map((r) => r.reason),
      ["during"],
    );
  });
});
