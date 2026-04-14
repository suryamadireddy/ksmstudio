// ── Artifact type (used by landing site components) ───────────────────────────
export type ArtifactType = "brief" | "synthesis" | "prd" | "directions";

// ── Triage JSONB ──────────────────────────────────────────────────────────────
export interface Triage {
  title?: string;
  effort_score: number;
  impact_score: number;
  confidence: number;
  time_horizon: "immediate" | "3mo" | "6mo" | "1yr" | "3yr+";
  who_benefits: string;
  kill_assumptions: string[];
  category: 1 | 2 | 3 | 4;
  provisional: boolean;
  triage_reasoning: string;
  disposition: "pursue" | "park" | "discard" | "kill";
  raw_transcript?: unknown[];
  triaged_at?: string;
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

// ── Supabase rows ─────────────────────────────────────────────────────────────
export interface Idea {
  id: string;
  raw_input: string;
  domain?: string;
  state?: string;
  created_at: string;
  triage?: Triage | null;
  development?: Development | null;
  portfolio?: unknown;
  outcomes?: unknown;
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
