/**
 * Pure helpers for merging keys into ideas.development.
 *
 * Artifact and sharpen writers must merge into the freshest blob at write
 * time. Spreading a pre-LLM snapshot after a multi-minute generation window
 * silently drops sibling keys written by concurrent stages/sharpening.
 */

export type DevelopmentBlob = Record<string, unknown>;

/** Merge one or more keys into a development blob without mutating input. */
export function mergeDevelopment(
  current: DevelopmentBlob | null | undefined,
  patch: DevelopmentBlob,
): DevelopmentBlob {
  return { ...(current ?? {}), ...patch };
}

/**
 * Merge a single stage/artifact key. Equivalent to mergeDevelopment with
 * one key, kept explicit for call-site clarity in the artifacts pipeline.
 */
export function mergeDevelopmentKey(
  current: DevelopmentBlob | null | undefined,
  key: string,
  value: unknown,
): DevelopmentBlob {
  return mergeDevelopment(current, { [key]: value });
}
