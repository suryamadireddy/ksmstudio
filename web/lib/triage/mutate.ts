import type { KillAssumption, Triage } from "@/lib/types";

export type TriageBlob = Triage | Record<string, unknown>;

const STATUS_VALUES = new Set([
  "validated",
  "invalidated",
  "weakened",
  "strengthened",
]);

export function isAssumptionStatus(status: string): boolean {
  return STATUS_VALUES.has(status);
}

/** Column/JSONB version used for optimistic concurrency against retriage writes. */
export function triageVersionToken(
  triageVersion: number | null | undefined,
  triage: TriageBlob | null | undefined,
): number {
  if (typeof triageVersion === "number" && Number.isFinite(triageVersion)) {
    return triageVersion;
  }
  const fromBlob = (triage as Triage | null | undefined)?.triage_version;
  if (typeof fromBlob === "number" && Number.isFinite(fromBlob)) {
    return fromBlob;
  }
  return 1;
}

function assumptionMatches(
  assumptionText: string,
  candidate: string,
): boolean {
  const a = assumptionText.toLowerCase();
  const b = candidate.toLowerCase();
  return a.includes(b) || b.includes(a);
}

export type ApplyKillAssumptionResult =
  | { updated: false; triage: TriageBlob }
  | { updated: true; triage: TriageBlob; matchedText: string };

/**
 * Pure triage JSONB mutation: update one kill-assumption status on a fresh
 * blob. Callers must persist with compare-and-swap on triage_version so a
 * concurrent retriage cannot be overwritten by a stale converse write.
 */
export function applyKillAssumptionStatus(
  current: TriageBlob | null | undefined,
  assumptionText: string,
  status: string,
  now = new Date().toISOString(),
): ApplyKillAssumptionResult {
  const triage: TriageBlob = {
    ...(current ?? {}),
    kill_assumptions: [
      ...(((current as Triage | null | undefined)?.kill_assumptions ??
        []) as (KillAssumption | string)[]),
    ],
  };

  const assumptions = triage.kill_assumptions as (KillAssumption | string)[];

  for (let i = 0; i < assumptions.length; i++) {
    const entry = assumptions[i];
    if (typeof entry !== "object" || entry === null || !("text" in entry)) {
      continue;
    }
    const text = String((entry as KillAssumption).text ?? "");
    if (!assumptionMatches(assumptionText, text)) continue;

    assumptions[i] = {
      ...(entry as KillAssumption),
      status: status as KillAssumption["status"],
      status_updated_at: now,
      status_source: "conversation",
    };
    triage.kill_assumptions = assumptions;
    return { updated: true, triage, matchedText: text };
  }

  return { updated: false, triage };
}
