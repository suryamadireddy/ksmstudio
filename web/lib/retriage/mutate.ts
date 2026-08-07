export type RetriageReason = {
  reason: string;
  flagged_at: string;
  source?: string;
};

export const MAX_RETRIAGE_CAS_ATTEMPTS = 3;

/** Normalize DB null / junk into a copied reason list. */
export function normalizeRetriageReasons(
  reasons: unknown,
): RetriageReason[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((entry): entry is RetriageReason => !!entry && typeof entry === "object")
    .map((entry) => ({ ...entry }));
}

/**
 * Append one retriage reason without mutating `current`.
 * Persist with compare-and-swap on the previous `retriage_reasons` value.
 */
export function appendRetriageReason(
  current: unknown,
  reason: string,
  now: string,
  source = "conversation",
): RetriageReason[] {
  const reasons = normalizeRetriageReasons(current);
  reasons.push({ reason, flagged_at: now, source });
  return reasons;
}

/**
 * Clear retriage flags. When `clearBefore` is set, keep reasons flagged
 * strictly after that ISO timestamp (concurrent insights during retriage).
 */
export function applyRetriageClear(
  current: unknown,
  clearBefore: string | null = null,
): { reasons: RetriageReason[]; pending: boolean } {
  const reasons = normalizeRetriageReasons(current);
  if (clearBefore == null) {
    return { reasons: [], pending: false };
  }
  const remaining = reasons.filter(
    (entry) => String(entry.flagged_at ?? "") > clearBefore,
  );
  return { reasons: remaining, pending: remaining.length > 0 };
}
