/** Category ↔ disposition invariants for triage completion writes. */

export const CATEGORY_DISPOSITION: Record<number, "pursue" | "potential" | "park" | "discard"> = {
  1: "pursue",
  2: "potential",
  3: "park",
  4: "discard",
};

const TIME_HORIZON_MAP: Record<string, string> = {
  immediate: "immediate",
  "3mo": "3mo",
  "6mo": "6mo",
  "1yr": "1yr",
  "3yr+": "3yr+",
  weeks: "immediate",
  days: "immediate",
  week: "immediate",
  month: "3mo",
  months: "3mo",
  "3 months": "3mo",
  "6 months": "6mo",
  "six months": "6mo",
  year: "1yr",
  years: "3yr+",
  "1 year": "1yr",
  "2 years": "3yr+",
  "3 years": "3yr+",
  "3+ years": "3yr+",
  "multi-year": "3yr+",
};

function asScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Derive category 1–4 from effort/impact scores (source of truth). */
export function deriveCategory(effort: number, impact: number): number {
  if (effort <= 2 && impact >= 3) return 1;
  if (effort >= 3 && impact >= 4) return 2;
  if (effort <= 2 && impact <= 2) return 3;
  if (effort >= 3 && impact <= 2) return 4;
  return impact >= 3 ? 2 : 4;
}

/**
 * Correct triage fields before persistence.
 * Category is always recomputed from scores; disposition is forced from category.
 */
export function validateTriageFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...data };

  const effort = asScore(out.effort_score, 3);
  const impact = asScore(out.impact_score, 3);
  out.effort_score = effort;
  out.impact_score = impact;

  out.category = deriveCategory(effort, impact);
  out.disposition = CATEGORY_DISPOSITION[out.category as number];

  const th = String(out.time_horizon ?? "").toLowerCase().trim();
  out.time_horizon = TIME_HORIZON_MAP[th] ?? "6mo";

  return out;
}
