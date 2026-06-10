// ── Artifact type (used by landing site components) ───────────────────────────
export type ArtifactType = "brief" | "synthesis" | "prd" | "directions";

// ── Kill assumption ───────────────────────────────────────────────────────────

export interface KillAssumption {
  text: string;
  status: "untested" | "validated" | "invalidated" | "weakened" | "strengthened";
  status_updated_at?: string;
  status_source?: "conversation" | "agent" | "user" | "triage";
}

// ── Triage JSONB ──────────────────────────────────────────────────────────────

export interface TriageSnapshot {
  // Full triage fields minus triage_history (to avoid circular nesting)
  title?: string;
  effort_score: number;
  impact_score: number;
  confidence: number;
  time_horizon: "immediate" | "3mo" | "6mo" | "1yr" | "3yr+";
  who_benefits: string;
  kill_assumptions: (KillAssumption | string)[];
  category: 1 | 2 | 3 | 4;
  provisional: boolean;
  triage_reasoning: string;
  disposition: "pursue" | "potential" | "park" | "discard";
  growth_observations?: string;
  session_level?: "foundational" | "intermediate" | "advanced";
  triaged_at: string;
  triage_version: number;
  retrigger_reason?: string | null;
}

export interface Triage {
  title?: string;
  effort_score: number;
  impact_score: number;
  confidence: number;
  time_horizon: "immediate" | "3mo" | "6mo" | "1yr" | "3yr+";
  who_benefits: string;
  kill_assumptions: (KillAssumption | string)[];
  category: 1 | 2 | 3 | 4;
  provisional: boolean;
  triage_reasoning: string;
  disposition: "pursue" | "potential" | "park" | "discard";
  triaged_at?: string;
  growth_observations?: string;
  session_level?: "foundational" | "intermediate" | "advanced";
  triage_version?: number;
  triage_history?: TriageSnapshot[];
}

// ── Development JSONB ─────────────────────────────────────────────────────────
export interface Persona {
  label: string;
  description: string;
  pain: string;
  gain: string;
  proxy_for_real_user?: boolean;
}

export interface Prd {
  problem?: string;
  solution: string;
  user_stories: string[];
  out_of_scope: string[];
  success_metrics: string[];
  constraints?: string;
  red_flags?: string[];
}

export interface MvpFeature {
  name: string;
  description?: string;
  story_ref?: string;
  hypothesis_link?: string;
  effort?: "small" | "medium" | "large";
  priority?: "must" | "should" | "could" | "wont";
}

export interface MvpScope {
  features?: MvpFeature[];
  mvp_cut?: MvpFeature[];
  deferred?: { name: string; reason: string }[];
  build_sequence: string[];
  effort_estimate?: string;
  scope_risk_flags?: string[];
}

export interface ResolutionAction {
  action: string;
  type: string;
  question_addressed?: string;
  method?: string;
  by_when?: string;
  owner?: string;
  blocks?: string;
}

export interface BuildAction {
  action: string;
  type: string;
  depends_on?: string | null;
  effort?: string;
  owner?: string;
  definition_of_done?: string;
}

export interface NextSteps {
  resolution_actions?: ResolutionAction[];
  build_actions?: BuildAction[];
  validation_actions?: unknown[];
  critical_path?: string;
  first_action: string;
}

export interface Development {
  // Sharpening
  research_synthesis?: string;
  competitive_landscape?: string;
  problem_statement?: string;
  core_hypothesis?: string;
  personas?: Persona[];
  open_questions?: string[];
  // Artifacts
  prd?: Prd;
  mvp_scope?: MvpScope;
  next_steps?: NextSteps;
  builder_brief?: unknown;
}

// ── Portfolio JSONB ───────────────────────────────────────────────────────────

export interface Portfolio {
  published: boolean;
  published_at: string | null;
  unpublished_at: string | null;
  slug: string;
  headline: string;

  versions: PortfolioVersion[];
  active_version_id: string | null;

  // Deprecated — kept for backward-read compatibility.
  public_summary?: string | null;
  chatbot_context?: string | null;
}

export interface PortfolioVersion {
  id: string;
  created_at: string;
  generated_by: "distillation" | "manual_edit";
  parent_version_id: string | null;
  creative_brief: string | null;

  character_card: CharacterCard;
  presentation: PresentationSpec;
  public_summary: { sections: RenderedSection[] };
  chatbot_context: ChatbotContext;
  voice: { summary: string; sample_lines: string[] };

  status: "active" | "archived" | "draft" | "working_draft";
  /** History for working_draft only; always an array (empty when not a working draft). */
  snapshots: WorkingDraftSnapshot[];
  /** Present on working_draft while workspace distillation wiring exists (Step 8+). */
  distillation_status?: {
    status: "idle" | "running" | "failed";
    last_attempt_at: string;
    error?: string;
  };
}

export interface CharacterCard {
  identity: string;
  motivation: string;
  domain_register: string;
  voice_dna: VoiceDna;
  default_posture: string;
  current_state: string;
  open_questions: string[];
}

export interface VoiceDna {
  tonal_register: "technical" | "editorial" | "playful" | "austere" | "warm";
  tonal_register_rationale: string;
  vocabulary: string[];
  sentence_rhythm: "short_clipped" | "measured_balanced" | "expansive_flowing";
  sentence_rhythm_rationale: string;
  humor_style: "dry" | "absent" | "wry" | "earnest";
  metaphor_sources: string[];
  what_it_doesnt_do: string[];
}

export type Archetype =
  | "statement"
  | "prose_block"
  | "quote_wall"
  | "timeline"
  | "data_panel"
  | "image_feature"
  | "list_inventory"
  | "side_by_side"
  | "artifact_explorer"
  | "signature_slot"
  | "conversation_invitation";

export type SectionWeight = "full" | "large" | "medium" | "small";

export type ConceptualTerritory =
  | "identity"
  | "motivation"
  | "thinking"
  | "state"
  | "invitation"
  | "conversation";

export interface PresentationSection {
  archetype: Archetype;
  weight: SectionWeight;
  purpose: ConceptualTerritory[];
  content_brief: string;
  notes?: string;
  hidden?: boolean;
}

export type AccentColor =
  | "amber"
  | "deep_teal"
  | "ember_red"
  | "sage"
  | "indigo"
  | "terracotta";

export type VisualRegister =
  | "technical"
  | "editorial"
  | "playful"
  | "austere"
  | "warm";

export interface SignatureElement {
  mode: "library" | "bespoke";
  library_component: string | null;
  bespoke_concept: string | null;
  placement: number;
  rationale: string;
}

export type LayoutTemplate = "clean" | "showcase" | "aesthetic";

/** Spatial placement for the signature; omitted means template defaults apply. */
export interface SignaturePlacement {
  mode: "inline" | "fixed_side" | "fixed_hero" | "floating";
  /** When mode is fixed_side */
  side?: "left" | "right";
  /** When mode is floating: position as % from left (0–100) */
  x_pct?: number;
  /** When mode is floating: position as % from top (0–100) */
  y_pct?: number;
  /** When mode is floating: width as % of viewport (20–80) */
  width_pct?: number;
  /** When mode is floating: height as % of viewport (20–80) */
  height_pct?: number;
}

export interface PresentationSpec {
  accent_color: AccentColor;
  accent_color_rationale: string;
  visual_register: VisualRegister;
  visual_register_rationale: string;
  layout_template: LayoutTemplate;
  layout_template_rationale: string;
  sections: PresentationSection[];
  signature_element: SignatureElement;
  signature_placement?: SignaturePlacement;
}

export interface RenderedSection {
  archetype: Archetype;
  content: unknown;
  /** When true, section is skipped by portfolio templates (workspace trim). */
  hidden?: boolean;
}

export interface ChatbotContext {
  identity_statement: string;
  voice_dna: VoiceDna;
  default_posture: string;
  current_state: string;
  open_curiosities: string[];
  idea_specific_refusals: string[];
}

export interface WorkingDraftSnapshot {
  id: string;
  created_at: string;
  trigger: "autosave" | "before_distillation" | "explicit";
  presentation: PresentationSpec;
  public_summary: { sections: RenderedSection[] };
  chatbot_context: ChatbotContext;
  voice: { summary: string; sample_lines: string[] };
}

// ── Outcomes JSONB ────────────────────────────────────────────────────────────
export interface OutcomeEntry {
  id: string;
  date: string;
  type: "milestone" | "pivot" | "kill" | "pause" | "launch" | "learning" | "metric";
  title: string;
  description: string;
  predicted_vs_actual?: {
    dimension: "effort" | "impact" | "timeline" | "confidence";
    predicted: string;
    actual: string;
    delta_note: string;
  } | null;
}

export interface Outcomes {
  entries: OutcomeEntry[];
  current_status: "active" | "paused" | "killed" | "launched" | "exploring";
  status_updated_at: string;
}

// ── Supabase rows ─────────────────────────────────────────────────────────────
export interface Idea {
  id: string;
  raw_input: string;
  domain?: string;
  state?: string;
  created_at: string;
  triage_version?: number;
  retriage_pending?: boolean;
  retriage_reasons?: Array<{
    reason: string;
    flagged_at: string;
    source: "conversation" | "agent" | "user";
  }>;
  published?: boolean;
  triage?: Triage | null;
  development?: Development | null;
  portfolio?: Portfolio | null;
  outcomes?: Outcomes | null;
  revision_history?: unknown;
}

export interface JournalEntry {
  id: string;
  idea_id: string;
  created_at: string;
  type: string;
  content: string;
  promoted_to?: string | null;
}

export interface Refinement {
  id: string;
  idea_id: string;
  created_at: string;
  triggered_by?: string;
  artifact?: string;
  field_path?: string;
  previous_value?: { value: string } | null;
  new_value?: { value: string };
  reason?: string;
}

export interface Conversation {
  id: string;
  idea_id: string;
  created_at: string;
  context?: string;
  summary?: string;
}

export interface Message {
  id: string;
  conversation_id?: string;
  idea_id: string;
  created_at: string;
  role: "user" | "idea" | "assistant";
  content: string;
  extracted?: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function ideaDisplayName(idea: Pick<Idea, "triage" | "raw_input">): string {
  const title = idea.triage?.title;
  if (title) return title;
  const raw = idea.raw_input?.trim();
  if (raw) return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
  return "Untitled idea";
}
