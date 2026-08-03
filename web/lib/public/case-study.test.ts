import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPublicCaseStudy } from "./case-study";
import type { Idea } from "@/lib/types";

function baseIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea-1",
    raw_input: "A private raw idea that should not leak into metadata",
    published: true,
    triage: {
      title: "Signal Board",
      effort_score: 4,
      impact_score: 5,
      confidence: 2,
      who_benefits: "Operators drowning in alert noise",
      time_horizon: "6mo",
      category: 2,
      disposition: "potential",
      triage_reasoning:
        "Private notebook reasoning about market doubt and kill criteria.",
      kill_assumptions: [
        { text: "Users will pay before onboarding completes", status: "untested" },
      ],
    },
    development: {
      problem_statement: "Operators miss critical alerts in noisy stacks.",
      core_hypothesis: "A focused signal board raises true-positive response rate.",
      personas: [
        {
          label: "Night-shift lead",
          description: "Owns pager rotations",
          pain: "Alert fatigue",
          gain: "Fewer false wakes",
          proxy_for_real_user: true,
        },
      ],
      prd: {
        solution: "Rank and cluster alerts with human-readable context.",
        user_stories: [],
        out_of_scope: [],
        success_metrics: [],
      },
    },
    portfolio: {
      published: true,
      published_at: "2026-04-01T00:00:00Z",
      unpublished_at: null,
      slug: "signal-board",
      headline: "A calmer way to see what matters",
      versions: [],
      active_version_id: null,
      public_summary: "Public summary for visitors.",
      chatbot_context: null,
    },
    ...overrides,
  } as Idea;
}

describe("toPublicCaseStudy", () => {
  it("returns null when published is missing or false", () => {
    assert.equal(toPublicCaseStudy(baseIdea({ published: false })), null);
    assert.equal(
      toPublicCaseStudy(baseIdea({ published: undefined as unknown as boolean })),
      null,
    );
  });

  it("returns null without a portfolio", () => {
    assert.equal(
      toPublicCaseStudy(baseIdea({ portfolio: null as unknown as Idea["portfolio"] })),
      null,
    );
  });

  it("projects curated public fields and omits private triage evaluation", () => {
    const study = toPublicCaseStudy(baseIdea());
    assert.ok(study);
    assert.equal(study.name, "Signal Board");
    assert.equal(study.headline, "A calmer way to see what matters");
    assert.equal(study.whoBenefits, "Operators drowning in alert noise");
    assert.equal(study.problemStatement, "Operators miss critical alerts in noisy stacks.");
    assert.equal(
      study.coreHypothesis,
      "A focused signal board raises true-positive response rate.",
    );
    assert.equal(
      study.solution,
      "Rank and cluster alerts with human-readable context.",
    );
    assert.equal(study.personas.length, 1);
    assert.equal(study.metaDescription, "A calmer way to see what matters");

    const json = JSON.stringify(study);
    assert.equal(json.includes("triage_reasoning"), false);
    assert.equal(json.includes("kill_assumptions"), false);
    assert.equal(json.includes("Private notebook reasoning"), false);
    assert.equal(json.includes("Users will pay before onboarding completes"), false);
    assert.equal(json.includes("effort_score"), false);
  });

  it("normalizes string personas so the public page cannot crash on .map", () => {
    const study = toPublicCaseStudy(
      baseIdea({
        development: {
          problem_statement: "x",
          // Runtime shape sharpen may persist when JSON parse fails.
          personas: JSON.stringify({
            label: "Solo founder",
            description: "Builds alone",
            pain: "Context switching",
            gain: "Focus",
            proxy_for_real_user: false,
          }),
        } as Idea["development"],
      }),
    );
    assert.ok(study);
    assert.equal(study.personas.length, 1);
    assert.equal(study.personas[0].label, "Solo founder");
  });

  it("falls back to public_summary for meta description when headline is empty", () => {
    const study = toPublicCaseStudy(
      baseIdea({
        portfolio: {
          ...baseIdea().portfolio!,
          headline: "   ",
        },
      }),
    );
    assert.ok(study);
    assert.equal(study.headline, null);
    assert.equal(study.metaDescription, "Public summary for visitors.");
  });
});
