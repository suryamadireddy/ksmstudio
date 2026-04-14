// Re-export all existing types
export type {
  ArtifactType,
  Triage,
  Persona,
  Prd,
  MvpFeature,
  MvpScope,
  ResolutionAction,
  BuildAction,
  NextSteps,
  Development,
  Idea,
  JournalEntry,
  Refinement,
  Conversation,
  Message,
} from "@/lib/types";
export { ideaDisplayName } from "@/lib/types";

// Studio-specific
export type DispositionColor = "green" | "amber" | "yellow" | "muted";

export function dispositionColor(
  d: string | undefined | null
): DispositionColor {
  if (d === "pursue") return "green";
  if (d === "potential") return "yellow";
  if (d === "park") return "amber";
  return "muted";
}

export const CATEGORY_LABEL: Record<number, string> = {
  1: "High signal",
  2: "Needs sharpening",
  3: "Speculative",
  4: "Weak signal",
};
