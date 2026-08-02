import type { Persona } from "@/lib/types";

/**
 * Normalize ideas.development.personas into an array of persona objects.
 *
 * Sharpening may persist personas as a raw string when JSON parsing fails, or
 * as a single object when the model omits the outer array. Callers that map
 * over personas must tolerate those shapes.
 */
export function normalizePersonas(raw: unknown): Persona[] {
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
