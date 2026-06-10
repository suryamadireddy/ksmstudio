import { randomUUID } from "node:crypto";
import type {
  AccentColor,
  Archetype,
  LayoutTemplate,
  Portfolio,
  PortfolioVersion,
  PresentationSection,
  PresentationSpec,
  RenderedSection,
  SectionWeight,
  SignaturePlacement,
  WorkingDraftSnapshot,
} from "@/lib/types";

const SNAPSHOT_CAP = 20;

export function asPortfolio(raw: unknown): Portfolio {
  const p = raw as Portfolio;
  return {
    ...p,
    versions: Array.isArray(p.versions) ? p.versions.map(normalizeVersion) : [],
  };
}

export function normalizeVersion(v: PortfolioVersion): PortfolioVersion {
  return {
    ...v,
    snapshots: Array.isArray(v.snapshots) ? v.snapshots : [],
  };
}

export function findWorkingDraft(versions: PortfolioVersion[]): PortfolioVersion | undefined {
  return versions.find((x) => x.status === "working_draft");
}

export function fingerprintDraftState(v: Pick<PortfolioVersion, "presentation" | "public_summary" | "chatbot_context">) {
  return JSON.stringify({
    presentation: v.presentation,
    public_summary: v.public_summary,
    chatbot_context: v.chatbot_context,
  });
}

export function lastSnapshotFingerprint(snapshots: WorkingDraftSnapshot[]): string | null {
  if (snapshots.length === 0) return null;
  const last = snapshots[snapshots.length - 1];
  return fingerprintDraftState(last);
}

export function appendSnapshot(
  working: PortfolioVersion,
  trigger: WorkingDraftSnapshot["trigger"],
): { next: PortfolioVersion; appended: boolean } {
  const fp = fingerprintDraftState(working);
  const prev = lastSnapshotFingerprint(working.snapshots);
  if (
    trigger !== "before_distillation" &&
    prev !== null &&
    prev === fp &&
    (trigger === "autosave" || trigger === "explicit")
  ) {
    return { next: working, appended: false };
  }

  const snap: WorkingDraftSnapshot = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    trigger,
    presentation: structuredClone(working.presentation),
    public_summary: structuredClone(working.public_summary),
    chatbot_context: structuredClone(working.chatbot_context),
    voice: structuredClone(working.voice),
  };

  const snaps = [...working.snapshots, snap];
  while (snaps.length > SNAPSHOT_CAP) snaps.shift();

  return { next: { ...working, snapshots: snaps }, appended: true };
}

/** New `working_draft` copied from any non–working-draft version (same shape as branching from active). */
export function branchWorkingDraftFromVersionSource(source: PortfolioVersion): PortfolioVersion {
  if (source.status === "working_draft") {
    throw new Error("branch_source_cannot_be_working_draft");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  return normalizeVersion({
    ...source,
    id,
    created_at: now,
    generated_by: "manual_edit",
    parent_version_id: source.id,
    creative_brief: null,
    status: "working_draft",
    snapshots: [],
    distillation_status: {
      status: "idle",
      last_attempt_at: now,
    },
  });
}

export function branchWorkingDraftFromActive(active: PortfolioVersion): PortfolioVersion {
  return branchWorkingDraftFromVersionSource(active);
}

export function copyWorkingDraftToDraft(working: PortfolioVersion): PortfolioVersion {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { distillation_status: _ds, ...rest } = working;
  void _ds;
  const copy: PortfolioVersion = {
    ...rest,
    id,
    created_at: now,
    generated_by: "manual_edit",
    parent_version_id: working.id,
    status: "draft",
    snapshots: [],
  };
  return normalizeVersion(copy);
}

const ACCENTS: AccentColor[] = [
  "amber",
  "deep_teal",
  "ember_red",
  "sage",
  "indigo",
  "terracotta",
];
const LAYOUTS: LayoutTemplate[] = ["clean", "showcase", "aesthetic"];

const ARCHETYPES: readonly Archetype[] = [
  "statement",
  "prose_block",
  "quote_wall",
  "timeline",
  "data_panel",
  "image_feature",
  "list_inventory",
  "side_by_side",
  "artifact_explorer",
  "signature_slot",
  "conversation_invitation",
];

const SECTION_WEIGHTS: readonly SectionWeight[] = ["full", "large", "medium", "small"];

const ARCH_SET = new Set<string>(ARCHETYPES);
const WEIGHT_SET = new Set<string>(SECTION_WEIGHTS);

function assertValidSections(raw: unknown): PresentationSpec["sections"] {
  if (!Array.isArray(raw)) throw new Error("invalid_sections");
  const out: PresentationSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("invalid_sections");
    const o = item as Record<string, unknown>;
    if (typeof o.archetype !== "string" || !ARCH_SET.has(o.archetype)) throw new Error("invalid_sections");
    if (typeof o.weight !== "string" || !WEIGHT_SET.has(o.weight)) throw new Error("invalid_sections");
    if (!Array.isArray(o.purpose)) throw new Error("invalid_sections");
    for (const pr of o.purpose) {
      if (typeof pr !== "string") throw new Error("invalid_sections");
    }
    if (typeof o.content_brief !== "string") throw new Error("invalid_sections");
    if (o.notes !== undefined && typeof o.notes !== "string") throw new Error("invalid_sections");
    if (o.hidden !== undefined && typeof o.hidden !== "boolean") throw new Error("invalid_sections");
    out.push(item as PresentationSection);
  }
  return out;
}

function assertValidSignaturePlacement(p: SignaturePlacement): void {
  const mode = p.mode;
  if (mode === "fixed_side") {
    if (p.side !== "left" && p.side !== "right") throw new Error("invalid_signature_placement");
    return;
  }
  if (mode === "floating") {
    const { x_pct, y_pct, width_pct, height_pct } = p;
    if (
      typeof x_pct !== "number" ||
      typeof y_pct !== "number" ||
      typeof width_pct !== "number" ||
      typeof height_pct !== "number"
    ) {
      throw new Error("invalid_signature_placement");
    }
    if (
      x_pct < 0 ||
      x_pct > 100 ||
      y_pct < 0 ||
      y_pct > 100 ||
      width_pct <= 0 ||
      width_pct > 100 ||
      height_pct <= 0 ||
      height_pct > 100
    ) {
      throw new Error("invalid_signature_placement");
    }
    return;
  }
  if (mode === "inline" || mode === "fixed_hero") return;
  throw new Error("invalid_signature_placement");
}

export type PresentationPatch = Partial<{
  accent_color: AccentColor;
  layout_template: LayoutTemplate;
  layout_template_rationale: string;
  signature_placement: SignaturePlacement | null;
  sections: PresentationSpec["sections"];
}>;

/**
 * Keeps public_summary.sections aligned with presentation.sections order and visibility
 * so the preview (which reads RenderedSection content) matches toolbar edits.
 */
export function alignPublicSummaryWithPresentationSections(
  presentationBefore: PresentationSpec,
  publicSummaryBefore: { sections: RenderedSection[] },
  newPresentationSections: PresentationSpec["sections"],
): { sections: RenderedSection[] } {
  const oldPres = presentationBefore.sections;
  const oldRs = publicSummaryBefore?.sections ?? [];
  const n = newPresentationSections.length;
  if (oldRs.length !== oldPres.length || n !== oldPres.length) {
    const len = Math.min(n, oldRs.length);
    return {
      sections: Array.from({ length: len }, (_, i) => {
        const r = oldRs[i] ?? ({ archetype: newPresentationSections[i]!.archetype, content: {} } as RenderedSection);
        const p = newPresentationSections[i];
        return {
          ...r,
          archetype: p?.archetype ?? r.archetype,
          hidden: p?.hidden ?? r.hidden,
        };
      }),
    };
  }

  const used = new Set<number>();
  const nextRendered: RenderedSection[] = newPresentationSections.map((np) => {
    let j = oldPres.findIndex((op, idx) => op === np);
    if (j === -1) {
      j = oldPres.findIndex(
        (op, idx) =>
          !used.has(idx) &&
          op.archetype === np.archetype &&
          op.content_brief === np.content_brief &&
          op.weight === np.weight,
      );
    }
    if (j === -1) {
      j = oldPres.findIndex((_, idx) => !used.has(idx));
    }
    used.add(j);
    const r = oldRs[j] ?? ({ archetype: np.archetype, content: {} } as RenderedSection);
    return {
      ...r,
      archetype: np.archetype,
      hidden: np.hidden ?? false,
    };
  });
  return { sections: nextRendered };
}

export function applyPresentationPatch(
  presentation: PresentationSpec,
  patch: PresentationPatch,
): PresentationSpec {
  const next = { ...presentation };
  if (patch.accent_color !== undefined) {
    if (!ACCENTS.includes(patch.accent_color)) throw new Error("invalid_accent_color");
    next.accent_color = patch.accent_color;
  }
  if (patch.layout_template !== undefined) {
    if (!LAYOUTS.includes(patch.layout_template)) throw new Error("invalid_layout_template");
    next.layout_template = patch.layout_template;
  }
  if (patch.layout_template_rationale !== undefined) {
    next.layout_template_rationale = patch.layout_template_rationale;
  }
  if (patch.signature_placement !== undefined) {
    if (patch.signature_placement === null) {
      delete next.signature_placement;
    } else {
      assertValidSignaturePlacement(patch.signature_placement);
      next.signature_placement = patch.signature_placement;
    }
  }
  if (patch.sections !== undefined) {
    next.sections = assertValidSections(patch.sections);
  }
  return next;
}

export function parsePresentationPatch(body: unknown): PresentationPatch {
  if (!body || typeof body !== "object") throw new Error("invalid_body");
  const root = body as Record<string, unknown>;
  const pres = root.presentation;
  if (pres === undefined || typeof pres !== "object" || pres === null) {
    throw new Error("presentation_required");
  }
  const o = pres as Record<string, unknown>;
  const allowed = new Set([
    "accent_color",
    "layout_template",
    "layout_template_rationale",
    "signature_placement",
    "sections",
  ]);
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) throw new Error(`disallowed_field:${k}`);
  }
  if (Object.keys(root).some((k) => k !== "presentation")) {
    throw new Error("only_presentation_allowed");
  }
  return o as PresentationPatch;
}
