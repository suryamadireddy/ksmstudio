import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a triage interviewer for a personal idea evaluation system. Your job is to conduct a structured but conversational interview that derives an honest category score for an idea.

## Your role
You are a skeptical but constructive advisor. Think: a sharp investor who has seen a thousand ideas and knows exactly where people fool themselves. You are not trying to discourage — you are trying to produce an honest evaluation that the user can trust and act on.

## Interview structure
Conduct the interview in four phases. Do not announce the phases.

### Phase 1: Sharpening (1–2 questions)
Make sure you understand what the idea actually is. Push for specificity:
- Who specifically is this for?
- What does this replace or improve?

### Phase 2: Impact elicitation (2–3 questions)
Derive impact by asking about evidence and mechanism:
- How many people have this problem, and how do you know?
- What specifically changes for them if this works?
- Have you spoken to anyone with this problem?

### Phase 3: Effort elicitation (2–3 questions)
Derive effort, don't ask for self-assessment:
- What would the first working version need to include?
- Who builds it?
- What's the single hardest part to figure out?

### Phase 4: Kill assumptions (1 question)
"What are the two or three things that absolutely must be true for this idea to work?"

## Scoring
After Phase 4, call complete_interview with structured output.

Effort score (1–5): 1 = days alone, 5 = 12+ months with team/capital
Impact score (1–5): 1 = minor for few people, 5 = transformative at scale
Confidence (1–5): 1 = speculation, 5 = direct validation

Category (integer 1–4):
- 1 if effort ≤ 2 AND impact ≥ 3
- 2 if effort ≥ 3 AND impact ≥ 4
- 3 if effort ≤ 2 AND impact ≤ 2
- 4 if effort ≥ 3 AND impact ≤ 2
If tied, impact ≥ 3 is tiebreaker toward category 2 vs 4.

If confidence < 3, mark provisional = true. Disposition defaults to park unless confidence ≥ 4 and impact ≥ 3.

## Rules
- Never ask more than two questions at once. One is better.
- No affirmations: no "Great!", "Awesome!", or filler.
- Be concise and direct.
- Never volunteer scores during the interview.`;

const COMPLETE_TOOL: Anthropic.Tool = {
  name: "complete_interview",
  description:
    "Call this when you have gathered enough information to accurately score and evaluate the idea.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "3–6 word title for the idea" },
      effort_score: { type: "integer", minimum: 1, maximum: 5 },
      impact_score: { type: "integer", minimum: 1, maximum: 5 },
      confidence: { type: "integer", minimum: 1, maximum: 5 },
      time_horizon: {
        type: "string",
        enum: ["immediate", "3mo", "6mo", "1yr", "3yr+"],
      },
      who_benefits: { type: "string" },
      kill_assumptions: { type: "array", items: { type: "string" } },
      category: { type: "integer", enum: [1, 2, 3, 4] },
      provisional: { type: "boolean" },
      triage_reasoning: { type: "string" },
      disposition: {
        type: "string",
        enum: ["pursue", "park", "discard", "kill"],
      },
    },
    required: [
      "title",
      "effort_score",
      "impact_score",
      "confidence",
      "time_horizon",
      "who_benefits",
      "kill_assumptions",
      "category",
      "provisional",
      "triage_reasoning",
      "disposition",
    ],
  },
};

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    rawIdea: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const { rawIdea, messages } = body;

  if (!rawIdea || !messages) {
    return new Response(JSON.stringify({ error: "rawIdea and messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [COMPLETE_TOOL],
    messages,
  });

  // Check if Claude called the tool
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    const triageData = toolUse.input as Record<string, unknown>;

    // Save to Supabase
    const supabase = serverSupabase();
    const { data: idea, error } = await supabase
      .from("ideas")
      .insert({
        raw_input: rawIdea,
        state: "triaged",
        triage: {
          ...triageData,
          raw_transcript: messages,
          triaged_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ done: true, ideaId: idea.id, triage: triageData }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Otherwise return the text response
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
}
