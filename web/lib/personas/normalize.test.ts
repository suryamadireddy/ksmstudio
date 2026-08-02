import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePersonas } from "./normalize.ts";

describe("normalizePersonas", () => {
  it("passes through a list of persona objects", () => {
    const raw = [{ label: "A", description: "d", pain: "p", gain: "g" }];
    assert.deepEqual(normalizePersonas(raw), raw);
  });

  it("parses a JSON string array", () => {
    const raw =
      '[{"label":"A","description":"d","pain":"p","gain":"g"}]';
    assert.equal(normalizePersonas(raw)[0]?.label, "A");
  });

  it("returns [] for unparseable sharpen fallback strings", () => {
    assert.deepEqual(normalizePersonas("- not json at all"), []);
  });

  it("wraps a single persona object", () => {
    const raw = { label: "Solo", description: "d", pain: "p", gain: "g" };
    assert.equal(normalizePersonas(raw)[0]?.label, "Solo");
  });

  it("wraps a single persona JSON object string", () => {
    assert.equal(
      normalizePersonas('{"label":"Solo","description":"d"}')[0]?.label,
      "Solo",
    );
  });

  it("filters non-object entries", () => {
    assert.deepEqual(normalizePersonas([{ label: "A" }, "skip", null, 3]), [
      { label: "A" },
    ]);
  });

  it("handles nullish and empty values", () => {
    assert.deepEqual(normalizePersonas(null), []);
    assert.deepEqual(normalizePersonas(""), []);
    assert.deepEqual(normalizePersonas([]), []);
  });
});
