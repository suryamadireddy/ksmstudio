import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeDevelopment, mergeDevelopmentKey } from "./merge.ts";

describe("mergeDevelopment", () => {
  it("preserves sibling keys when applying a stage patch", () => {
    const current = {
      problem_statement: "ps",
      prd: { problem: "old" },
      mvp_scope: { in: ["a"] },
    };

    const next = mergeDevelopment(current, {
      prd: { problem: "new" },
    });

    assert.equal(next.problem_statement, "ps");
    assert.deepEqual(next.mvp_scope, { in: ["a"] });
    assert.deepEqual(next.prd, { problem: "new" });
  });

  it("treats null/undefined current as empty", () => {
    assert.deepEqual(mergeDevelopment(null, { prd: { problem: "x" } }), {
      prd: { problem: "x" },
    });
    assert.deepEqual(mergeDevelopment(undefined, { next_steps: {} }), {
      next_steps: {},
    });
  });

  it("does not mutate the input blob", () => {
    const current = { prd: { problem: "a" }, mvp_scope: { in: ["b"] } };
    const next = mergeDevelopment(current, { prd: { problem: "c" } });
    assert.equal(current.prd.problem, "a");
    assert.notEqual(next, current);
  });
});

describe("mergeDevelopmentKey", () => {
  it("models the artifacts stale-snapshot race fix", () => {
    // Tab A loaded before Tab B finished mvp_scope + next_steps.
    const stalePreLlmSnapshot = {
      problem_statement: "ps",
      prd: { problem: "from A start" },
    };
    const freshAtWriteTime = {
      problem_statement: "ps",
      prd: { problem: "from B" },
      mvp_scope: { in: ["shipped by B"] },
      next_steps: { now: ["by B"] },
    };
    const aPrd = { problem: "from A finish" };

    const lostUpdate = mergeDevelopmentKey(stalePreLlmSnapshot, "prd", aPrd);
    assert.equal(lostUpdate.mvp_scope, undefined);

    const safe = mergeDevelopmentKey(freshAtWriteTime, "prd", aPrd);
    assert.deepEqual(safe.mvp_scope, { in: ["shipped by B"] });
    assert.deepEqual(safe.next_steps, { now: ["by B"] });
    assert.deepEqual(safe.prd, aPrd);
  });
});
