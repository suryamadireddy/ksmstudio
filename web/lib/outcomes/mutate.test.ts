import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OutcomeEntry, Outcomes } from "../types.ts";
import {
  applyOutcomesAction,
  currentStatusFromEntries,
  outcomesVersionToken,
} from "./mutate.ts";

function entry(
  partial: Pick<OutcomeEntry, "id" | "type" | "title"> &
    Partial<OutcomeEntry>,
): OutcomeEntry {
  return {
    date: partial.date ?? "2026-07-01T00:00:00.000Z",
    description: partial.description ?? "desc",
    predicted_vs_actual: partial.predicted_vs_actual ?? null,
    ...partial,
  };
}

describe("currentStatusFromEntries", () => {
  it("returns exploring when no status-driving entries remain", () => {
    assert.equal(
      currentStatusFromEntries([
        entry({ id: "1", type: "milestone", title: "m" }),
      ]),
      "exploring",
    );
  });

  it("uses the latest kill/pause/launch entry", () => {
    assert.equal(
      currentStatusFromEntries([
        entry({ id: "1", type: "kill", title: "k" }),
        entry({ id: "2", type: "launch", title: "l" }),
      ]),
      "launched",
    );
  });
});

describe("applyOutcomesAction", () => {
  it("adds an entry and auto-updates status for kill", () => {
    const next = applyOutcomesAction(null, {
      action: "add_entry",
      entry: {
        type: "kill",
        title: "Stopped",
        description: "No path forward",
      },
      id: "kill-1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(next.entries.length, 1);
    assert.equal(next.current_status, "killed");
    assert.equal(next.status_updated_at, "2026-07-25T12:00:00.000Z");
  });

  it("recomputes status when deleting the status-driving entry", () => {
    const current: Outcomes = {
      entries: [
        entry({ id: "m1", type: "milestone", title: "Ship POC" }),
        entry({ id: "k1", type: "kill", title: "Killed" }),
      ],
      current_status: "killed",
      status_updated_at: "2026-07-25T11:00:00.000Z",
    };

    const next = applyOutcomesAction(current, {
      action: "delete_entry",
      entry_id: "k1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.deepEqual(
      next.entries.map((e) => e.id),
      ["m1"],
    );
    assert.equal(next.current_status, "exploring");
    assert.equal(next.status_updated_at, "2026-07-25T12:00:00.000Z");
  });

  it("falls back to the previous status-driving entry after delete", () => {
    const current: Outcomes = {
      entries: [
        entry({ id: "k1", type: "kill", title: "Killed" }),
        entry({ id: "p1", type: "pause", title: "Paused" }),
      ],
      current_status: "paused",
      status_updated_at: "2026-07-25T11:00:00.000Z",
    };

    const next = applyOutcomesAction(current, {
      action: "delete_entry",
      entry_id: "p1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(next.current_status, "killed");
  });

  it("preserves a manual status when deleting an unrelated entry", () => {
    const current: Outcomes = {
      entries: [entry({ id: "m1", type: "milestone", title: "Note" })],
      current_status: "active",
      status_updated_at: "2026-07-25T11:00:00.000Z",
    };

    const next = applyOutcomesAction(current, {
      action: "delete_entry",
      entry_id: "m1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(next.current_status, "active");
  });

  it("does not mutate the input outcomes object (lost-update safety)", () => {
    const current: Outcomes = {
      entries: [entry({ id: "m1", type: "milestone", title: "Note" })],
      current_status: "exploring",
      status_updated_at: "2026-07-25T11:00:00.000Z",
    };

    const next = applyOutcomesAction(current, {
      action: "add_entry",
      entry: {
        type: "learning",
        title: "Learned",
        description: "Something",
      },
      id: "l1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(current.entries.length, 1);
    assert.equal(next.entries.length, 2);
    assert.equal(
      outcomesVersionToken(current),
      "2026-07-25T11:00:00.000Z",
    );
    assert.equal(outcomesVersionToken(next), "2026-07-25T12:00:00.000Z");
  });

  it("simulates a concurrent add where the stale write would drop an entry", () => {
    const base: Outcomes = {
      entries: [],
      current_status: "exploring",
      status_updated_at: "2026-07-25T10:00:00.000Z",
    };

    const writerA = applyOutcomesAction(base, {
      action: "add_entry",
      entry: { type: "milestone", title: "A", description: "from A" },
      id: "a",
      now: "2026-07-25T10:01:00.000Z",
    });
    const writerB = applyOutcomesAction(base, {
      action: "add_entry",
      entry: { type: "learning", title: "B", description: "from B" },
      id: "b",
      now: "2026-07-25T10:02:00.000Z",
    });

    // Without CAS, persisting writerB after writerA drops entry A.
    assert.equal(writerB.entries.length, 1);
    assert.equal(writerB.entries[0]?.id, "b");

    // With CAS, B must re-read A and merge:
    const retriedB = applyOutcomesAction(writerA, {
      action: "add_entry",
      entry: { type: "learning", title: "B", description: "from B" },
      id: "b",
      now: "2026-07-25T10:03:00.000Z",
    });
    assert.deepEqual(
      retriedB.entries.map((e) => e.id),
      ["a", "b"],
    );
    assert.notEqual(
      outcomesVersionToken(writerA),
      outcomesVersionToken(retriedB),
    );
  });
});
