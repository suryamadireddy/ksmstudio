import type { Idea, Persona, Portfolio } from "@/lib/types";
import { ideaDisplayName } from "@/lib/types";

/**
 * Curated public case-study fields for `/p/[slug]`.
 *
 * Never include private evaluation data such as triage scores,
 * triage_reasoning, or kill_assumptions — those belong in the studio notebook.
 */
export type PublicCaseStudy = {
  id: string;
  name: string;
  headline: string | null;
  whoBenefits: string | null;
  problemStatement: string | null;
  coreHypothesis: string | null;
  solution: string | null;
  personas: Persona[];
  metaDescription: string | null;
};

function normalizePersonas(raw: unknown): Persona[] {
  let value: unknown = raw;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try {
      value = JSON.parse(text);
    } catch {
      return [];
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return [value as Persona];
  }

  if (!Array.isArray(value)) return [];

  return value.filter(
    (p): p is Persona =>
      Boolean(p) && typeof p === "object" && !Array.isArray(p),
  );
}

function publicSummaryText(portfolio: Portfolio | null | undefined): string | null {
  if (!portfolio) return null;
  if (typeof portfolio.public_summary === "string") {
    const text = portfolio.public_summary.trim();
    return text || null;
  }
  return null;
}

/**
 * Project a published idea row into the public case-study DTO.
 * Returns null when the row is missing, unpublished, or has no portfolio.
 */
export function toPublicCaseStudy(
  idea: Pick<
    Idea,
    "id" | "raw_input" | "published" | "triage" | "development" | "portfolio"
  > | null
    | undefined,
): PublicCaseStudy | null {
  if (!idea?.published || !idea.portfolio) return null;

  const portfolio = idea.portfolio;
  const development = idea.development;
  const name = ideaDisplayName(idea);
  const headline = portfolio.headline?.trim() || null;
  const summary = publicSummaryText(portfolio);

  return {
    id: idea.id,
    name,
    headline,
    whoBenefits: idea.triage?.who_benefits?.trim() || null,
    problemStatement: development?.problem_statement?.trim() || null,
    coreHypothesis: development?.core_hypothesis?.trim() || null,
    solution: development?.prd?.solution?.trim() || null,
    personas: normalizePersonas(development?.personas),
    metaDescription: headline ?? summary ?? null,
  };
}
