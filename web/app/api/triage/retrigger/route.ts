import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { REASONING_MODEL } from "@/lib/models";
import { TRIAGE_SYSTEM_PROMPT_TEMPLATE, COMPLETE_INTERVIEW_TOOL } from "@/lib/triage-shared";
import type { Triage, TriageSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

// ── Shared helpers ────────────────────────────────────────────────────────────

const TIME_HORIZON_MAP: Record<string, string> = {
  immediate: "immediate", "3mo": "3mo", "6mo": "6mo", "1yr": "1yr", "3yr+": "3yr+",
  weeks: "immediate", days: "immediate", week: "immediate",
  month: "3mo", months: "3mo", "3 months": "3mo",
  "6 months": "6mo", "six months": "6mo",
  year: "1yr", years: "3yr+", "1 year": "1yr",
  "2 years": "3yr+", "3 years": "3yr+", "3+ years": "3yr+", "multi-year": "3yr+",
};

const CATEGORY_DISPOSITION: Record<number, string> = {
  1: "pursue", 2: "potential", 3: "park", 4: "discard",
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
  const cat = out.category;
  if (typeof cat !== "number" || ![1, 2, 3, 4].includes(cat as number)) {
    out.category = deriveCategory(
      (out.effort_score as number) ?? 3,
      (out.impact_score as number) ?? 3
    );
  }
  const expected = CATEGORY_DISPOSITION[out.category as number];
  if (!["pursue", "potential", "park", "discard"].includes(out.disposition as string) || out.disposition !== expected) {
    out.disposition = expected;
  }
  const th = String(out.time_horizon ?? "").toLowerCase().trim();
  out.time_horizon = TIME_HORIZON_MAP[th] ?? "6mo";
  return out;
}

// ── Re-triage context builder ─────────────────────────────────────────────────

function buildRetriagedContext(
  idea: Record<string, unknown>,
  currentTriage: Triage,
  priorTriages: Array<Record<string, unknown>>
): string {
  const lines: string[] = [
    "## This is a RE-TRIAGE of an existing idea.",
    "",
    `Original idea: "${idea.raw_input ?? ""}"`,
    "",
    `### Current triage (version ${currentTriage.triage_version ?? 1}):`,
    `- Scores: effort=${currentTriage.effort_score}, impact=${currentTriage.impact_score}, confidence=${currentTriage.confidence}`,
    `- Disposition: ${currentTriage.disposition}`,
    `- Who benefits: ${currentTriage.who_benefits}`,
    "- Kill assumptions:",
    ...(currentTriage.kill_assumptions ?? []).map((a) =>
      typeof a === "object" ? `  - ${a.text} [${a.status ?? "untested"}]` : `  - ${a}`
    ),
    `- Reasoning: ${currentTriage.triage_reasoning}`,
    `- Triaged at: ${currentTriage.triaged_at ?? "unknown"}`,
    "",
  ];

  const history = currentTriage.triage_history ?? [];
  if (history.length > 0) {
    lines.push(`### Prior triage versions (${history.length}):`);
    for (const prior of history) {
      lines.push(
        `- v${prior.triage_version} (${prior.triaged_at}): ` +
        `effort=${prior.effort_score}, impact=${prior.impact_score}, disposition=${prior.disposition}`
      );
    }
    lines.push("");
  }

  const dev = (idea.development ?? {}) as Record<string, unknown>;
  if (dev.problem_statement) {
    lines.push("### Sharpening output exists");
    lines.push(`Problem statement: ${String(dev.problem_statement).slice(0, 300)}...`);
    lines.push("");
  }
  if (dev.prd) { lines.push("### PRD exists"); lines.push(""); }
  if (dev.builder_brief) { lines.push("### Builder brief exists"); lines.push(""); }

  lines.push("### Your job for this re-triage:");
  lines.push(
    "You are re-evaluating an idea that has a history. " +
    "The user has new thinking, new evidence, or has requested a fresh look. " +
    "Probe what has changed. Challenge whether previous kill assumptions are still the right ones. " +
    "Notice if the user has grown in their thinking about this specific idea — and name it when you see it. " +
    "Compare the current articulation to the prior one and surface what is sharper now and what is still unclear."
  );

  if (priorTriages.length > 0) {
    lines.push("");
    lines.push("You have also conducted triage sessions on other ideas with this user:");
    priorTriages.forEach((row, i) => {
      const t = (row.triage ?? {}) as Record<string, unknown>;
      lines.push(
        `Session ${i + 1}: "${t.title ?? "Untitled"}" — ` +
        `effort=${t.effort_score}, impact=${t.impact_score}, disposition=${t.disposition}`
      );
    });
  }

  return lines.join("\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let idea_id: string;
  let messages: Array<{ role: "user" | "assistant"; content: string }>;

  try {
    const body = await req.json();
    idea_id = body.idea_id;
    messages = body.messages ?? [];
    if (!idea_id) throw new Error("idea_id required");
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = await createClient();

  // Fetch the idea being re-triaged
  const { data: ideaRow, error: ideaError } = await supabase
    .from("ideas")
    .select("id, raw_input, triage, triage_version, development")
    .eq("id", idea_id)
    .single();

  if (ideaError || !ideaRow) {
    return new Response(
      JSON.stringify({ error: "Idea not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const currentTriage = (ideaRow.triage ?? {}) as Triage;

  // Fetch prior triages from other ideas
  const { data: priorRows } = await supabase
    .from("ideas")
    .select("triage")
    .not("triage", "is", null)
    .neq("id", idea_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const retraigeContext = buildRetriagedContext(
    ideaRow as Record<string, unknown>,
    currentTriage,
    (priorRows ?? []) as Array<Record<string, unknown>>
  );

  const activePrompt = TRIAGE_SYSTEM_PROMPT_TEMPLATE.replace(
    "{{PRIOR_TRIAGE_CONTEXT}}",
    retraigeContext
  );

  // Seed opener if no messages provided
  if (messages.length === 0) {
    messages = [
      {
        role: "user",
        content:
          `I want to re-triage this existing idea: ` +
          `"${currentTriage.title ?? (ideaRow.raw_input as string) ?? ""}". ` +
          "Here is what I want to revisit or update about it.",
      },
    ];
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

        const toolBlock = finalMsg.content.find(
          (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        if (toolBlock && toolBlock.name === "complete_interview") {
          const raw = toolBlock.input as Record<string, unknown>;
          const validated = validateFields(raw);

          // Fetch fresh triage to build history snapshot
          const { data: freshRow } = await supabase
            .from("ideas")
            .select("triage")
            .eq("id", idea_id)
            .single();

          const freshTriage = ((freshRow?.triage ?? {}) as Triage);
          const history: TriageSnapshot[] = [...(freshTriage.triage_history ?? [])];
          const currentVersion = (freshRow as Record<string, unknown>)?.triage_version as number ?? freshTriage.triage_version ?? 1;

          // Snapshot current triage into history — strip raw_transcript and triage_history
          const snapshot = Object.fromEntries(
            Object.entries(freshTriage).filter(([k]) => k !== "triage_history" && k !== "raw_transcript")
          ) as TriageSnapshot;
          history.push(snapshot);

          const now = new Date().toISOString();
          const newTriage = {
            ...validated,
            triaged_at: now,
            triage_version: currentVersion + 1,
            triage_history: history,
          };

          const { error: updateError } = await supabase
            .from("ideas")
            .update({
              triage: newTriage,
              triage_version: currentVersion + 1,
              retriage_pending: false,
              retriage_reasons: [],
            })
            .eq("id", idea_id);

          if (updateError) {
            send({ error: updateError.message });
          } else {
            // Write retriage conversation + messages
            const convId = crypto.randomUUID();
            await supabase.from("conversations").insert({
              id: convId,
              idea_id,
              context: "retriage",
              created_at: now,
            });
            for (const msg of messages) {
              await supabase.from("messages").insert({
                id: crypto.randomUUID(),
                conversation_id: convId,
                idea_id,
                role: msg.role,
                content: msg.content,
                created_at: now,
              });
            }
            send({ done: true, idea_id, triage: validated });
          }
        } else {
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
