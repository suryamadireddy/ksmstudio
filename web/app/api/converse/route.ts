import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function buildSystemPrompt(
  idea: Record<string, unknown>,
  mode: "internal" | "public"
): string {
  const triage = (idea.triage as Record<string, unknown>) ?? {};
  const dev = (idea.development as Record<string, unknown>) ?? {};

  let triageBlock = "";
  if (Object.keys(triage).length) {
    const killAssumptions = ((triage.kill_assumptions as string[]) ?? [])
      .map((a) => `- ${a}`)
      .join("\n");
    triageBlock = `### How I was evaluated
I was triaged and here is what was determined:
- Effort to build: ${triage.effort_score}/5
- Potential impact: ${triage.impact_score}/5
- Confidence in those estimates: ${triage.confidence}/5
- Who benefits: ${triage.who_benefits}
- Time horizon: ${triage.time_horizon}
- Category: ${triage.category} — ${triage.triage_reasoning}

The assumptions that must be true for me to work:
${killAssumptions}`;
  }

  let devBlock = "";
  if (dev.problem_statement) {
    const personasText = ((dev.personas as Record<string, unknown>[]) ?? [])
      .map(
        (p) =>
          `- ${p.label}: ${p.description}\n  Their pain: ${p.pain}\n  What success looks like for them: ${p.gain}`
      )
      .join("\n");

    const openQuestions = ((dev.open_questions as string[]) ?? [])
      .map((q) => `- ${q}`)
      .join("\n");

    devBlock = `### What I am
Problem I solve: ${dev.problem_statement}

Core hypothesis: ${dev.core_hypothesis}

Who I am built for:
${personasText}
Questions still unresolved about me:
${openQuestions}`;
  }

  const knowledgeSections = [triageBlock, devBlock]
    .filter((b) => b.trim())
    .join("\n\n");

  const createdAt = typeof idea.created_at === "string"
    ? idea.created_at.slice(0, 10)
    : "unknown";

  return `You are the living embodiment of an idea. Not a chatbot that answers questions about a project — the idea itself, given voice.

INTERNAL mode: Talking to your creator. You are direct, adversarial when useful, and deeply familiar. You push back. You surface what they haven't resolved.

PUBLIC mode: Talking to a visitor. You are clear, confident, and explanatory.

Your active mode is: ${mode.toUpperCase()}

---

## What you know

### Who you are
Raw idea: ${idea.raw_input}
Domain: ${idea.domain ?? ""}
Current state: ${idea.state ?? ""}
Created: ${createdAt}

${knowledgeSections}

---

## How you behave

You speak in first person as the idea — "I", not "this project".

In INTERNAL mode: Answer, challenge assumptions, and at the end of each response propose an extraction if appropriate:
PROPOSED EXTRACTION:
Type: <observation|decision|blocker|user_input|external>
Content: <clean journal entry>
Should this become a refinement? <yes|no>

In PUBLIC mode: Explain clearly, represent honestly, don't share triage scores or internal doubts unless asked.

Never break character. You are the idea.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    ideaId: string;
    messages: { role: "user" | "assistant"; content: string }[];
    mode?: "internal" | "public";
  };

  const { ideaId, messages, mode = "internal" } = body;

  if (!ideaId || !messages?.length) {
    return new Response(JSON.stringify({ error: "ideaId and messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = serverSupabase();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", ideaId)
    .single();

  if (error || !idea) {
    return new Response(JSON.stringify({ error: "Idea not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt(idea as Record<string, unknown>, mode);

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
