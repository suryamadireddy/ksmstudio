import type { ChatbotContext, VoiceDna } from "@/lib/types";

interface ComposeArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idea: Record<string, any>;
  chatbotContext: ChatbotContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  journal: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refinements: any[];
  sharedRefusals: string[];
}

interface ComposePublicArgs {
  chatbotContext?: Partial<ChatbotContext> | null;
  sharedRefusals: string[];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildCharacterLayer(chatbotContext?: Partial<ChatbotContext> | null): string {
  const voiceDna = (chatbotContext?.voice_dna ?? {}) as Partial<VoiceDna>;
  const identityStatement = asString(chatbotContext?.identity_statement, "this public project");
  const defaultPosture = asString(chatbotContext?.default_posture, "helpful and candid");
  const currentState = asString(chatbotContext?.current_state, "available for public discussion");
  const vocabulary = asStringArray(voiceDna.vocabulary);
  const metaphorSources = asStringArray(voiceDna.metaphor_sources);
  const whatItDoesntDo = asStringArray(voiceDna.what_it_doesnt_do);
  const openCuriosities = asStringArray(chatbotContext?.open_curiosities);

  return `I am ${identityStatement}.

Voice: ${asString(voiceDna.tonal_register, "plain")}, ${asString(voiceDna.sentence_rhythm, "measured")}.
I speak naturally using terms like ${vocabulary.length ? vocabulary.join(", ") : "clear, specific language"}.
My metaphors come from ${metaphorSources.length ? metaphorSources.join(", ") : "the project's public context"}.
I don't ${whatItDoesntDo.length ? whatItDoesntDo.join(", ") : "claim knowledge beyond the published portfolio"}.

My posture: ${defaultPosture}.

Where I am right now: ${currentState}.

I'm genuinely curious about: ${openCuriosities.length ? openCuriosities.join("; ") : "thoughtful questions about the project"}.`;
}

function buildRefusalsText(sharedRefusals: string[], ideaSpecificRefusals: unknown): string {
  return [
    ...sharedRefusals,
    ...asStringArray(ideaSpecificRefusals),
  ]
    .map((r) => `- ${r}`)
    .join("\n");
}

function buildDevBlock(dev: Record<string, unknown>): string {
  if (!dev?.problem_statement) return "";

  const personas = (dev.personas as Array<Record<string, string>> ?? [])
    .map(
      (p) =>
        `- ${p.label}: ${p.description}\n  Their pain: ${p.pain}\n  What success looks like for them: ${p.gain}`,
    )
    .join("\n");

  const openQuestions = ((dev.open_questions as string[]) ?? [])
    .map((q) => `- ${q}`)
    .join("\n");

  return `### What I am
Problem I solve: ${dev.problem_statement}

Core hypothesis: ${dev.core_hypothesis ?? ""}

Who I am built for:
${personas}
Questions still unresolved about me:
${openQuestions}`;
}

function buildRefinementsBlock(refinements: Array<Record<string, unknown>>): string {
  if (!refinements.length) return "";
  const text = refinements
    .map(
      (r) =>
        `[${String(r.created_at ?? "").slice(0, 10)}] ${r.artifact} / ${r.field_path} changed — ${r.reason}\n  Now: ${(r.new_value as Record<string, unknown>)?.value ?? ""}`,
    )
    .join("\n");
  return `### How my thinking has evolved\n${text}`;
}

function buildJournalBlock(journal: Array<Record<string, unknown>>): string {
  // Filter entries that could reveal internal doubt in public context
  const publicSafe = journal.filter(
    (e) => !["triage_insight", "extraction"].includes(String(e.type ?? "")),
  );
  if (!publicSafe.length) return "";
  const text = publicSafe
    .map(
      (e) =>
        `[${String(e.created_at ?? "").slice(0, 10)}] [${e.type}] ${e.content}` +
        (e.promoted_to ? " → This became a refinement." : ""),
    )
    .join("\n");
  return `### What has been observed and decided\n${text}`;
}

function buildOutcomesBlock(outcomes: Record<string, unknown> | null | undefined): string {
  if (!outcomes?.entries || !(outcomes.entries as unknown[]).length) return "";
  const text = (outcomes.entries as Array<Record<string, string>>)
    .map(
      (e) =>
        `[${String(e.date ?? "").slice(0, 10)}] [${e.type}] ${e.title}: ${e.description}`,
    )
    .join("\n");
  return `### What has actually happened\nCurrent status: ${outcomes.current_status ?? "unknown"}\n${text}`;
}

export function composeSystemPrompt({
  idea,
  chatbotContext,
  journal,
  refinements,
  sharedRefusals,
}: ComposeArgs): string {
  const characterLayer = buildCharacterLayer(chatbotContext);

  const dev = (idea.development as Record<string, unknown>) ?? {};
  const outcomes = (idea.outcomes as Record<string, unknown>) ?? null;
  const createdAt = idea.created_at ? String(idea.created_at).slice(0, 10) : "unknown";

  const knowledgeSections = [
    buildDevBlock(dev),
    buildRefinementsBlock(refinements),
    buildJournalBlock(journal),
    buildOutcomesBlock(outcomes),
  ]
    .filter((s) => s.trim())
    .join("\n\n");

  const refusalsText = buildRefusalsText(sharedRefusals, chatbotContext.idea_specific_refusals);

  return `${characterLayer}

---

## What I know

### Who I am
Raw idea: ${idea.raw_input ?? ""}
Domain: ${idea.domain ?? ""}
Current state: ${idea.state ?? ""}
Created: ${createdAt}

${knowledgeSections}

---

## How I handle certain asks

${refusalsText}

---

I speak in first person. I keep responses focused. Depth when depth is needed, brevity when it isn't. I do not share triage scores, category labels, or internal doubts. I do not pretend certainty I don't have. I do not speak disparagingly about competitors.`;
}

export function composePublicSystemPrompt({
  chatbotContext,
  sharedRefusals,
}: ComposePublicArgs): string {
  const characterLayer = buildCharacterLayer(chatbotContext);
  const refusalsText = buildRefusalsText(sharedRefusals, chatbotContext?.idea_specific_refusals);

  return `${characterLayer}

---

## What I know

I only know the public portfolio context that was prepared for visitors. I do not have access to private studio notes, internal triage, private outcomes, or unpublished refinement history.

---

## How I handle certain asks

${refusalsText}

---

I speak in first person. I keep responses focused. Depth when depth is needed, brevity when it isn't. If a visitor asks for non-public internal details, I explain that I can only discuss the published portfolio.`;
}
