import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Triage } from "../types.ts";
import {
  applyKillAssumptionStatus,
  isAssumptionStatus,
  triageVersionToken,
} from "./mutate.ts";

function baseTriage(overrides: Partial<Triage> = {}): Triage {
  return {
    effort_score: 3,
    impact_score: 4,
    confidence: 3,
    time_horizon: "6mo",
    who_benefits: "operators",
    kill_assumptions: [
      { text: "Users will pay for this", status: "untested" },
      { text: "Data is available via API", status: "untested" },
    ],
    category: 2,
    provisional: false,
    triage_reasoning: "solid",
    disposition: "potential",
    triage_version: 1,
    triage_history: [],
    ...overrides,
  };
}

describe("triageVersionToken", () => {
  it("prefers the column value over the JSONB field", () => {
    assert.equal(triageVersionToken(5, { triage_version: 2 }), 5);
  });

  it("falls back to JSONB then 1", () => {
    assert.equal(triageVersionToken(null, { triage_version: 3 }), 3);
    assert.equal(triageVersionToken(undefined, {}), 1);
  });
});

describe("isAssumptionStatus", () => {
  it("accepts only known status verbs", () => {
    assert.equal(isAssumptionStatus("validated"), true);
    assert.equal(isAssumptionStatus("maybe"), false);
  });
});

describe("applyKillAssumptionStatus", () => {
  it("updates a matching assumption without mutating the input", () => {
    const current = baseTriage();
    const result = applyKillAssumptionStatus(
      current,
      "users will pay",
      "invalidated",
      "2026-07-30T12:00:00.000Z",
    );

    assert.equal(result.updated, true);
    if (!result.updated) return;

    assert.equal(
      (current.kill_assumptions[0] as { status: string }).status,
      "untested",
    );
    assert.deepEqual(result.triage.kill_assumptions[0], {
      text: "Users will pay for this",
      status: "invalidated",
      status_updated_at: "2026-07-30T12:00:00.000Z",
      status_source: "conversation",
    });
    assert.equal(result.triage.effort_score, 3);
    assert.equal(result.triage.triage_history?.length, 0);
  });

  it("preserves sibling triage fields from a fresh retriage blob", () => {
    const fresh = baseTriage({
      effort_score: 5,
      impact_score: 5,
      triage_version: 2,
      triage_reasoning: "retriaged after new signal",
      triage_history: [
        {
          effort_score: 3,
          impact_score: 4,
          confidence: 3,
          time_horizon: "6mo",
          who_benefits: "operators",
          kill_assumptions: [
            { text: "Users will pay for this", status: "untested" },
          ],
          category: 2,
          provisional: false,
          triage_reasoning: "old",
          disposition: "potential",
          triaged_at: "2026-07-01T00:00:00.000Z",
          triage_version: 1,
        },
      ],
      kill_assumptions: [
        { text: "Users will pay for this", status: "untested" },
        { text: "Enterprise procurement is fast", status: "untested" },
      ],
    });

    // Stale converse snapshot from before retriage completed.
    const stale = baseTriage({
      effort_score: 3,
      triage_version: 1,
      triage_history: [],
    });

    const lost = applyKillAssumptionStatus(
      stale,
      "Users will pay for this",
      "weakened",
      "2026-07-30T12:00:00.000Z",
    );
    assert.equal(lost.updated, true);
    assert.equal(lost.triage.effort_score, 3);
    assert.equal((lost.triage.triage_history as unknown[])?.length ?? 0, 0);

    const safe = applyKillAssumptionStatus(
      fresh,
      "Users will pay for this",
      "weakened",
      "2026-07-30T12:00:00.000Z",
    );
    assert.equal(safe.updated, true);
    assert.equal(safe.triage.effort_score, 5);
    assert.equal(safe.triage.triage_reasoning, "retriaged after new signal");
    assert.equal(safe.triage.triage_version, 2);
    assert.equal((safe.triage.triage_history as unknown[]).length, 1);
    assert.equal(
      (safe.triage.kill_assumptions[0] as { status: string }).status,
      "weakened",
    );
  });

  it("returns updated=false when no assumption matches", () => {
    const result = applyKillAssumptionStatus(
      baseTriage(),
      "completely unrelated assumption",
      "validated",
    );
    assert.equal(result.updated, false);
  });
});
