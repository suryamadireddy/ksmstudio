import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { REASONING_MODEL } from "@/lib/models";
import { TRIAGE_SYSTEM_PROMPT_TEMPLATE, COMPLETE_INTERVIEW_TOOL } from "@/lib/triage-shared";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_HORIZON_MAP: Record<string, string> = {
  immediate: "immediate",
  "3mo": "3mo",
  "6mo": "6mo",
  "1yr": "1yr",
  "3yr+": "3yr+",
  weeks: "immediate",
  days: "immediate",
  week: "immediate",
  month: "3mo",
  months: "3mo",
  "3 months": "3mo",
  "6 months": "6mo",
  "six months": "6mo",
  year: "1yr",
  years: "3yr+",
  "1 year": "1yr",
  "2 years": "3yr+",
  "3 years": "3yr+",
  "3+ years": "3yr+",
  "multi-year": "3yr+",
};

const CATEGORY_DISPOSITION: Record<number, string> = {
  1: "pursue",
  2: "potential",
  3: "park",
  4: "discard",
};

function deriveCategory(effort: number, impact: number): number {
  if (effort <= 2 && impact >= 3) return 1;
  if (effort >= 3 && impact >= 4) return 2;
  if (effort <= 2 && impact <= 2) return 3;
  if (effort >= 3 && impact <= 2) return 4;
  return impact >= 3 ? 2 : 4;
}

function validateFields(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  // category
  const cat = out.category;
  if (typeof cat !== "number" || ![1, 2, 3, 4].includes(cat as number)) {
    out.category = deriveCategory(
      (out.effort_score as number) ?? 3,
      (out.impact_score as number) ?? 3
    );
  }

  // disposition
  const expected = CATEGORY_DISPOSITION[out.category as number];
  if (!["pursue", "potential", "park", "discard"].includes(out.disposition as string) || out.disposition !== expected) {
    out.disposition = expected;
  }

  // time_horizon
  const th = String(out.time_horizon ?? "").toLowerCase().trim();
  const mapped = TIME_HORIZON_MAP[th];
  out.time_horizon = mapped ?? "6mo";

  return out;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let messages: Array<{ role: "user" | "assistant"; content: string }>;

  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages array required");
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const rawInput = messages.find((m) => m.role === "user")?.content ?? "";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Fetch prior triages for adaptive difficulty injection
  const supabaseForHistory = await createClient();
  const { data: priorRows } = await supabaseForHistory
    .from("ideas")
    .select("triage")
    .not("triage", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  let priorContext = "";
  if (priorRows && priorRows.length > 0) {
    const lines = ["You have conducted prior triage sessions with this user:\n"];
    priorRows.forEach((row, i) => {
      const t = (row.triage ?? {}) as Record<string, unknown>;
      lines.push(
        `Session ${i + 1}: "${t.title ?? "Untitled"}"\n` +
        `  Scores: effort=${t.effort_score}, impact=${t.impact_score}, confidence=${t.confidence}\n` +
        `  Disposition: ${t.disposition}\n` +
        `  Level: ${t.session_level ?? "unknown"}\n` +
        `  Growth observations: ${t.growth_observations ?? "none recorded"}\n`
      );
    });
    priorContext = lines.join("\n");
  }

  const activePrompt = TRIAGE_SYSTEM_PROMPT_TEMPLATE.replace("{{PRIOR_TRIAGE_CONTEXT}}", priorContext);

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const stream = anthropic.messages.stream({
          model: REASONING_MODEL,
          max_tokens: 1024,
          system: activePrompt,
          tools: [COMPLETE_INTERVIEW_TOOL],
          tool_choice: { type: "auto" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinking: { type: "adaptive" } as any,
          messages,
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ text: event.delta.text });
          }
        }

        const finalMsg = await stream.finalMessage();

        // Check if Claude called complete_interview
        const toolBlock = finalMsg.content.find(
          (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        if (toolBlock && toolBlock.name === "complete_interview") {
          const raw = toolBlock.input as Record<string, unknown>;
          const validated = validateFields(raw);

          const supabase = await createClient();
          const ideaId = crypto.randomUUID();
          const now = new Date().toISOString();

          const { error } = await supabase
            .from("ideas")
            .insert({
              id: ideaId,
              raw_input: rawInput,
              state: "triaged",
              triage_version: 1,
              triage: {
                ...validated,
                triaged_at: now,
              },
            });

          if (error) {
            send({ error: error.message });
          } else {
            // Write triage conversation + messages
            const convId = crypto.randomUUID();
            await supabase.from("conversations").insert({
              id: convId,
              idea_id: ideaId,
              context: "triage",
              created_at: now,
            });
            for (const msg of messages) {
              await supabase.from("messages").insert({
                id: crypto.randomUUID(),
                conversation_id: convId,
                idea_id: ideaId,
                role: msg.role,
                content: msg.content,
                created_at: now,
              });
            }
            send({ done: true, idea_id: ideaId, triage: validated });
          }
        } else {
          // Just a regular text response — already streamed above
          send({ turn_done: true });
        }

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
