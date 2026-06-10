import { describe, it, expect } from "vitest";
import { toPublicIdea } from "@/lib/portfolio/public-projection";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import type { ChatbotContext } from "@/lib/types";

// Distinctive sentinel VALUES for every internal field. If any of these strings
// appears in the assembled public context, internal data has leaked.
const INTERNAL_VALUES = [
  "SENTINEL_RAW_INPUT_unpolished_original_idea",
  "SENTINEL_TRIAGE_REASONING_scored_low_weak_demand",
  "SENTINEL_KILL_ASSUMPTION_nobody_wants_this",
  "SENTINEL_RESEARCH_SYNTHESIS_market_too_small",
  "SENTINEL_PROBLEM_STATEMENT_internal",
  "SENTINEL_CORE_HYPOTHESIS_internal",
  "SENTINEL_COMPETITIVE_LANDSCAPE_internal",
  "SENTINEL_OUTCOME_we_killed_it",
  "SENTINEL_BUILDER_BRIEF_internal",
  "SENTINEL_PERSONA_PAIN_internal",
];

// Internal field-name TOKENS (snake_case identifiers) that must never surface.
// Note: the English phrase "kill assumption" appears intentionally in the
// guardrail prose, so we assert on the snake_case identifier instead.
const INTERNAL_FIELD_NAMES = [
  "raw_input",
  "triage_reasoning",
  "kill_assumptions",
  "effort_score",
  "impact_score",
  "confidence",
  "disposition",
  "research_synthesis",
  "problem_statement",
  "core_hypothesis",
  "competitive_landscape",
  "builder_brief",
  "growth_observations",
];

const PUBLIC_IDENTITY = "PUBLIC_IDENTITY_a_distilled_public_narrative";
const PUBLIC_SUMMARY_TEXT = "PUBLIC_SUMMARY_what_the_visitor_already_sees";

const chatbotContext: ChatbotContext = {
  identity_statement: PUBLIC_IDENTITY,
  voice_dna: {
    tonal_register: "editorial",
    tonal_register_rationale: "r",
    vocabulary: ["clarity", "craft"],
    sentence_rhythm: "measured_balanced",
    sentence_rhythm_rationale: "r",
    humor_style: "dry",
    metaphor_sources: ["architecture"],
    what_it_doesnt_do: ["overpromise"],
  },
  default_posture: "curious and grounded",
  current_state: "in active development",
  open_curiosities: ["how people actually decide"],
  idea_specific_refusals: ["I won't quote private numbers"],
};

// A full `ideas` row exactly as the table would return it — INCLUDING all the
// internal blobs the deny-by-default boundary is meant to strip.
function fullInternalRow() {
  return {
    id: "idea-1",
    raw_input: INTERNAL_VALUES[0],
    domain: "developer-tools",
    state: "sharpened",
    created_at: "2026-06-09T00:00:00Z",
    triage: {
      effort_score: 2,
      impact_score: 5,
      confidence: 3,
      disposition: "pursue",
      category: 1,
      triage_reasoning: INTERNAL_VALUES[1],
      growth_observations: "internal note",
      kill_assumptions: [
        { text: INTERNAL_VALUES[2], status: "untested" },
      ],
    },
    development: {
      research_synthesis: INTERNAL_VALUES[3],
      problem_statement: INTERNAL_VALUES[4],
      core_hypothesis: INTERNAL_VALUES[5],
      competitive_landscape: INTERNAL_VALUES[6],
      personas: [{ label: "x", description: "y", pain: INTERNAL_VALUES[9], gain: "z" }],
      builder_brief: INTERNAL_VALUES[8],
    },
    outcomes: {
      current_status: "killed",
      entries: [
        { date: "2026-05-01", type: "kill", title: "killed", description: INTERNAL_VALUES[7] },
      ],
    },
    portfolio: {
      headline: "A public headline",
      slug: "my-idea",
      active_version_id: "v1",
      versions: [
        {
          id: "v1",
          status: "active",
          chatbot_context: chatbotContext,
          public_summary: {
            sections: [
              { archetype: "statement", content: { text: PUBLIC_SUMMARY_TEXT } },
            ],
          },
        },
      ],
    },
  };
}

describe("deny-by-default public projection", () => {
  const row = fullInternalRow();
  const activeVersion = row.portfolio.versions[0];
  const publicIdea = toPublicIdea(row, activeVersion);
  const prompt = composeSystemPrompt({ publicIdea, sharedRefusals: SHARED_REFUSALS });

  it("projection carries only the allowlisted keys", () => {
    expect(Object.keys(publicIdea).sort()).toEqual(
      ["chatbotContext", "created_at", "domain", "headline", "publicSummary", "slug", "state"].sort(),
    );
  });

  it("no internal VALUE appears in the assembled context", () => {
    for (const value of INTERNAL_VALUES) {
      expect(prompt, `internal value leaked: ${value}`).not.toContain(value);
    }
  });

  it("no internal field-name TOKEN appears in the assembled context", () => {
    for (const name of INTERNAL_FIELD_NAMES) {
      expect(prompt, `internal field name leaked: ${name}`).not.toContain(name);
    }
  });

  it("no internal VALUE survives anywhere in the serialized projection", () => {
    const serialized = JSON.stringify(publicIdea);
    for (const value of INTERNAL_VALUES) {
      expect(serialized, `internal value reached projection: ${value}`).not.toContain(value);
    }
  });

  it("public-safe content IS present (projection is not simply empty)", () => {
    expect(prompt).toContain(PUBLIC_IDENTITY);
    expect(prompt).toContain(PUBLIC_SUMMARY_TEXT);
  });
});
