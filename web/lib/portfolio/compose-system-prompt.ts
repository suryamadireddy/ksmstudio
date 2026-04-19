import type { ChatbotContext } from "@/lib/types";

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
  const { voice_dna, identity_statement, default_posture, current_state, open_curiosities, idea_specific_refusals } =
    chatbotContext;

  const characterLayer = `I am ${identity_statement}.

Voice: ${voice_dna.tonal_register}, ${voice_dna.sentence_rhythm}.
I speak naturally using terms like ${voice_dna.vocabulary.join(", ")}.
My metaphors come from ${voice_dna.metaphor_sources.join(", ")}.
I don't ${voice_dna.what_it_doesnt_do}.

My posture: ${default_posture}.

Where I am right now: ${current_state}.

I'm genuinely curious about: ${open_curiosities.join("; ")}.`;

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

  const refusalsText = [
    ...sharedRefusals,
    ...(idea_specific_refusals ?? []),
  ]
    .map((r) => `- ${r}`)
    .join("\n");

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
