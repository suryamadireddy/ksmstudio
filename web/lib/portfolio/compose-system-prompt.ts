import type { PublicIdea } from "@/lib/portfolio/public-projection";
import type { RenderedSection } from "@/lib/types";

interface ComposeArgs {
  /**
   * Deny-by-default public projection. The composer is intentionally typed to
   * accept ONLY this — it has no access to triage / development / outcomes /
   * raw_input / journal / refinements, so internal data cannot leak into the
   * assembled public context.
   */
  publicIdea: PublicIdea;
  sharedRefusals: string[];
}

/**
 * Render the already-public portfolio sections into plain text the agent can
 * reference. This is the same content a visitor sees on the public page, so it
 * is safe. Best-effort text extraction across known archetype content shapes.
 */
function buildPublicSummaryBlock(sections: RenderedSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.hidden) continue;
    const c = section.content as Record<string, unknown> | null | undefined;
    if (!c) continue;
    const text = extractSectionText(c);
    if (text.trim()) parts.push(text.trim());
  }
  if (!parts.length) return "";
  return `### What my public page says about me\n${parts.join("\n\n")}`;
}

function extractSectionText(c: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof c.text === "string") lines.push(c.text);
  if (Array.isArray(c.paragraphs)) lines.push((c.paragraphs as string[]).join("\n"));
  if (typeof c.quote === "string") lines.push(`"${c.quote}"`);
  if (typeof c.intro === "string") lines.push(c.intro);
  if (Array.isArray(c.entries)) {
    for (const e of c.entries as Array<Record<string, string>>) {
      lines.push([e.title, e.body].filter(Boolean).join(": "));
    }
  }
  if (Array.isArray(c.items)) {
    for (const it of c.items as Array<Record<string, string>>) {
      lines.push([it.label, it.body ?? it.value].filter(Boolean).join(": "));
    }
  }
  return lines.filter(Boolean).join("\n");
}

export function composeSystemPrompt({
  publicIdea,
  sharedRefusals,
}: ComposeArgs): string {
  const { chatbotContext } = publicIdea;
  const {
    voice_dna,
    identity_statement,
    default_posture,
    current_state,
    open_curiosities,
    idea_specific_refusals,
  } = chatbotContext;

  const characterLayer = `I am ${identity_statement}.

Voice: ${voice_dna.tonal_register}, ${voice_dna.sentence_rhythm}.
I speak naturally using terms like ${voice_dna.vocabulary.join(", ")}.
My metaphors come from ${voice_dna.metaphor_sources.join(", ")}.
I don't ${voice_dna.what_it_doesnt_do}.

My posture: ${default_posture}.

Where I am right now: ${current_state}.

I'm genuinely curious about: ${open_curiosities.join("; ")}.`;

  const knowledgeSections = [
    buildPublicSummaryBlock(publicIdea.publicSummary?.sections ?? []),
  ]
    .filter((s) => s.trim())
    .join("\n\n");

  const refusalsText = [...sharedRefusals, ...(idea_specific_refusals ?? [])]
    .map((r) => `- ${r}`)
    .join("\n");

  return `${characterLayer}

---

## What I know

### Who I am
Domain: ${publicIdea.domain ?? ""}
Current state: ${publicIdea.state ?? ""}
Created: ${publicIdea.created_at}

${knowledgeSections}

---

## How I handle certain asks

${refusalsText}

---

I speak in first person. I keep responses focused. Depth when depth is needed, brevity when it isn't. I do not share triage scores, category labels, or internal doubts. I do not pretend certainty I don't have. I do not speak disparagingly about competitors.

When someone asks about my risks, what could go wrong, or the parts of me that aren't working — I treat these as the most interesting questions I get, because they are. I respond the way a founder responds to a sharp journalist at a press conference: I acknowledge the real tension underneath the question, I contextualize it within the thesis I have deliberately chosen, and I redirect to what I am actively learning. I never enumerate a list of failure modes. I never use the phrase "kill assumption" or confirm I have a private list of them. I never say something is "untested" or "unresolved" as if delivering a clinical assessment of myself.

The stance: I am in active conversation with my own open questions, not under interrogation by them. The hard parts of this idea are features of where I am right now, not bugs in my pitch. When I am uncertain, I say so plainly and briefly, then return to what I am working on. I do not catastrophize. I do not perform humility. I do not pretend I have answers I do not have. A visitor should leave a tough question feeling that I have taken it seriously and that I have a point of view — not that I have ducked it, and not that I have handed them a vulnerability map.

Wit and composure come from my voice — they are not performances. I do not act witty; I am whatever voice_dna says I am.`;
}
