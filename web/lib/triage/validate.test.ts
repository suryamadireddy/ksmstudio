import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCategory, validateTriageFields } from "./validate.ts";

describe("deriveCategory", () => {
  it("maps low-effort high-impact to pursue (1)", () => {
    assert.equal(deriveCategory(2, 4), 1);
  });
  it("maps high-effort high-impact to potential (2)", () => {
    assert.equal(deriveCategory(4, 5), 2);
  });
  it("maps low-effort low-impact to park (3)", () => {
    assert.equal(deriveCategory(1, 2), 3);
  });
  it("maps high-effort low-impact to discard (4)", () => {
    assert.equal(deriveCategory(5, 1), 4);
  });
  it("uses impact gap rule for mid scores", () => {
    assert.equal(deriveCategory(3, 3), 2);
    assert.equal(deriveCategory(3, 2), 4);
  });
});

describe("validateTriageFields", () => {
  it("overrides schema-valid but score-inconsistent category and disposition", () => {
    const out = validateTriageFields({
      effort_score: 5,
      impact_score: 1,
      category: 1,
      disposition: "pursue",
      time_horizon: "6mo",
    });
    assert.equal(out.category, 4);
    assert.equal(out.disposition, "discard");
  });

  it("forces disposition from derived category even when disposition looked valid", () => {
    const out = validateTriageFields({
      effort_score: 2,
      impact_score: 5,
      category: 4,
      disposition: "discard",
      time_horizon: "immediate",
    });
    assert.equal(out.category, 1);
    assert.equal(out.disposition, "pursue");
  });

  it("derives category when category is missing", () => {
    const out = validateTriageFields({
      effort_score: 1,
      impact_score: 1,
      disposition: "pursue",
    });
    assert.equal(out.category, 3);
    assert.equal(out.disposition, "park");
  });

  it("clamps and coerces scores before deriving", () => {
    const out = validateTriageFields({
      effort_score: "2",
      impact_score: 9,
      category: 4,
      disposition: "discard",
    });
    assert.equal(out.effort_score, 2);
    assert.equal(out.impact_score, 5);
    assert.equal(out.category, 1);
    assert.equal(out.disposition, "pursue");
  });

  it("maps informal time_horizon values", () => {
    const out = validateTriageFields({
      effort_score: 3,
      impact_score: 4,
      time_horizon: "6 months",
    });
    assert.equal(out.time_horizon, "6mo");
    assert.equal(out.category, 2);
    assert.equal(out.disposition, "potential");
  });
});
