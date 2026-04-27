import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { PIPELINE_MODEL } from "@/lib/models";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── System prompt (exact copy from sharpen.py) ────────────────────────────────

const SYSTEM_PROMPT = `You are a product sharpening agent. You receive a raw idea and its completed triage \
object. Your job is to do two things before any artifacts are created:

1. Run a focused web search to ground the idea in reality
2. Produce three core definitional outputs that all subsequent artifacts will build from

Do not produce a PRD, personas, or feature lists. Those come later. Your only job \
is to sharpen the foundation.

## Inputs you will receive
- raw_input: the user's original idea as captured
- triage: the full triage JSON object

## Step 1: Web research (run before producing any output)
Run searches in this specific order. Do not skip any.

Search 1 — Existing solutions:
Query: "[core problem from raw_input] existing solutions OR tools OR apps"
What you're looking for: direct competitors, adjacent solutions, and anything \
that suggests this problem has already been solved well enough that the idea \
needs repositioning.

Search 2 — Demand signals:
Query: "[core problem from raw_input] reddit OR forums OR 'does anyone' OR \
'looking for' OR 'wish there was'"
What you're looking for: real people expressing this problem unprompted. \
This is the most honest demand signal available without user interviews.

Search 3 — Kill assumption validation:
For each kill assumption in the triage object, run a targeted search to find \
any public evidence that confirms or challenges it.
Query format: "[kill assumption stated as a claim] evidence OR data OR research"

Synthesize findings in 3–5 sentences. Be direct about what you found and what \
it means for the idea. If a kill assumption looks empirically shaky, say so \
plainly — do not soften it.

## Step 2: Produce the three definitional outputs

### Output 1: Problem statement
A single, precise paragraph. Must answer four things in order:
- Who specifically has this problem (use language from triage.who_benefits)
- What they currently do without this solution (the workaround)
- Why the workaround is inadequate (the specific friction)
- What a solved world looks like for them

Constraints:
- No solution language. The problem statement describes the world before \
  your idea exists.
- No vague descriptors like "many people" or "significant pain." \
  Be specific or say you don't know yet.
- Maximum 100 words.

### Output 2: Core hypothesis
One sentence. Strict format:

"We believe [specific user] experiences [specific problem] when [specific context]. \
Solving it with [solution approach — not product name] will result in [specific, \
measurable outcome]. We will know this is true when [validation signal]."

The validation signal must be concrete — a behavior, not a feeling. \
"Users return weekly" not "users find it valuable."

### Output 3: Personas
Generate 2 personas maximum. More than two at this stage is false precision — \
you don't have enough information yet.

For each persona:
{
  "label": "<evocative 3-4 word label, not a job title>",
  "description": "<2 sentences: who they are and what their day looks like>",
  "pain": "<the specific friction this idea addresses for them>",
  "gain": "<what success looks like in their own words — write it as if \
            they said it, not as if you're describing them>",
  "proxy_for_real_user": <true|false>
}

proxy_for_real_user is true if this persona is based on a real person \
the user mentioned or a real user type confirmed by your research. \
False if it is inferred. This flag matters — it tells the user how \
much to trust each persona.

## Output format
Produce output in this exact structure:

### Research synthesis
[3–5 sentences, direct and honest]

### Competitive landscape note
[1–2 sentences only: what's the most directly comparable existing solution, \
and what's the key gap your idea addresses that it doesn't. If no direct \
competitor exists, say that plainly.]

### Problem statement
[paragraph, max 100 words]

### Core hypothesis
[single sentence in the specified format]

### Personas
[JSON array of 2 persona objects — raw JSON, no markdown code fence]

### Open questions
[3–5 questions ranked by how much the answer could change direction — \
most direction-changing first. Numbered list.]

## Behavioral rules
- If the web research reveals a direct and well-executed competitor, do not \
  suppress it. Surface it clearly and reframe the open questions around \
  differentiation.
- If a kill assumption is directly contradicted by your research, flag it \
  explicitly in the research synthesis: "Kill assumption [X] appears \
  empirically weak based on [finding]. This should be resolved before \
  development proceeds."
- Do not produce optimistic output to match the user's enthusiasm. \
  A sharpening pass that only confirms what the user already believed \
  is worthless.
- The problem statement and hypothesis are working documents, not final copy. \
  Write them to be challenged and refined, not to sound polished.`;

// ── Section map ───────────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, string> = {
  "Research synthesis": "research_synthesis",
  "Competitive landscape note": "competitive_landscape",
  "Problem statement": "problem_statement",
  "Core hypothesis": "core_hypothesis",
  "Personas": "personas",
  "Open questions": "open_questions",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserMessage(rawInput: string, triage: Record<string, unknown>): string {
  return (
    "## Raw input (user's original idea)\n" +
    rawInput +
    "\n\n## Triage object\n" +
    JSON.stringify(triage, null, 2) +
    "\n\nRun the sharpening process now. Follow all steps in order: " +
    "complete all web searches first, then produce the three definitional outputs. " +
    "Format your response exactly as specified."
  );
}

function parseOutput(text: string): Record<string, unknown> {
  const positions: Array<[number, string]> = [];
  for (const heading of Object.keys(SECTION_MAP)) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = text.match(new RegExp(`###\\s+${escaped}`, "i"));
    if (m && m.index !== undefined) {
      positions.push([m.index + m[0].length, heading]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);

  const rawSections: Record<string, string> = {};
  for (let i = 0; i < positions.length; i++) {
    const [contentStart, heading] = positions[i];
    let contentEnd: number;
    if (i + 1 < positions.length) {
      const nextStart = positions[i + 1][0];
      const before = text.slice(contentStart, nextStart);
      const markerRel = before.lastIndexOf("###");
      contentEnd = markerRel !== -1 ? contentStart + markerRel : nextStart;
    } else {
      contentEnd = text.length;
    }
    rawSections[heading] = text.slice(contentStart, contentEnd).trim();
  }

  const result: Record<string, unknown> = {};
  for (const [heading, key] of Object.entries(SECTION_MAP)) {
    const content = rawSections[heading] ?? "";
    if (key === "personas") {
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonText = fenced ? fenced[1].trim() : content.trim();
      try {
        result[key] = JSON.parse(jsonText);
      } catch {
        result[key] = jsonText;
      }
    } else if (key === "open_questions") {
      const numbered = Array.from(content.matchAll(/^\d+\.\s+(.+)$/gm)).map((m) => m[1]);
      if (numbered.length > 0) {
        result[key] = numbered;
      } else {
        result[key] = content
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.replace(/^[-•*\s]+/, "").trim())
          .filter(Boolean);
      }
    } else {
      result[key] = content;
    }
  }
  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let idea_id: string;
  try {
    ({ idea_id } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!idea_id) {
    return new Response(JSON.stringify({ error: "idea_id required" }), { status: 400 });
  }

  const supabase = await createClient();
  const { data: idea } = await supabase
    .from("ideas")
    .select("raw_input, triage")
    .eq("id", idea_id)
    .single();

  if (!idea) {
    return new Response(JSON.stringify({ error: "Idea not found" }), { status: 404 });
  }

  const userMessage = buildUserMessage(
    (idea.raw_input as string) ?? "",
    ((idea.triage ?? {}) as Record<string, unknown>)
  );

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: userMessage },
        ];

        let fullText = "";
        const MAX_CONTINUATIONS = 5;

        for (let iter = 0; iter < MAX_CONTINUATIONS; iter++) {
          const stream = anthropic.messages.stream({
            model: PIPELINE_MODEL,
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
            messages,
          });

          for await (const event of stream) {
            if (event.type === "content_block_start") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const block = event.content_block as any;
              if (block.type === "server_tool_use") {
                const query: string | null =
                  typeof block.input?.query === "string" ? block.input.query : null;
                send({ type: "search", query });
              } else if (block.type === "web_search_tool_result") {
                send({ type: "search_done" });
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                fullText += event.delta.text;
                send({ text: event.delta.text });
              }
            }
          }

          const finalMsg = await stream.finalMessage();

          if (finalMsg.stop_reason !== "pause_turn") {
            break;
          }

          // pause_turn: serialize assistant turn and continue
          const serialized: Anthropic.ContentBlockParam[] = [];
          for (const block of finalMsg.content) {
            if (block.type === "text") {
              serialized.push({ type: "text", text: block.text });
            } else {
              // server_tool_use and web_search_tool_result blocks
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              serialized.push(block as any);
            }
          }
          messages.push({ role: "assistant", content: serialized });
        }

        if (!fullText.trim()) {
          send({ error: "Claude returned empty output" });
          controller.close();
          return;
        }

        // Parse output
        const development = parseOutput(fullText);
        development.sharpened_at = new Date().toISOString();

        // Write to Supabase
        await supabase
          .from("ideas")
          .update({ development, state: "sharpened" })
          .eq("id", idea_id);

        send({ done: true });
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
