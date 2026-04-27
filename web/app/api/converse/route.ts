import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { Idea, JournalEntry, Conversation, Refinement, Outcomes } from "@/lib/types";
import { CONVERSE_MODEL } from "@/lib/models";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function buildSystemPrompt(
  idea: Idea,
  journal: JournalEntry[],
  summaries: Conversation[],
  refinements: Refinement[],
  mode: string
): string {
  const t = idea.triage;
  const d = idea.development;

  const triageBlock = t ? `### How I was evaluated
- Effort to build: ${t.effort_score}/5
- Potential impact: ${t.impact_score}/5
- Confidence: ${t.confidence}/5
- Who benefits: ${t.who_benefits}
- Time horizon: ${t.time_horizon}
- Category: ${t.category} — ${t.triage_reasoning}

Kill assumptions:
${(t.kill_assumptions ?? []).map((a) =>
    typeof a === "object" ? `- ${a.text} [${a.status ?? "untested"}]` : `- ${a}`
).join("\n")}` : "";

  const personas = (() => {
    const raw = d?.personas;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  })();

  const devBlock = d?.problem_statement ? `### What I am
Problem I solve: ${d.problem_statement}
Core hypothesis: ${d.core_hypothesis}
Who I am built for:
${personas.map((p: any) => `- ${p.label}: ${p.description}\n  Pain: ${p.pain}\n  Gain: ${p.gain}`).join("\n")}
Open questions:
${(d.open_questions ?? []).map((q) => `- ${q}`).join("\n")}` : "";

  const refinementsBlock = refinements.length > 0 ? `### How my thinking has evolved
${refinements.map((r) => `[${r.created_at?.slice(0, 10)}] ${r.artifact} / ${r.field_path} — ${r.reason}\n  Now: ${r.new_value?.value ?? ""}`).join("\n")}` : "";

  const journalBlock = journal.length > 0 ? `### What has been observed and decided
${journal.map((e) => `[${e.created_at?.slice(0, 10)}] [${e.type}] ${e.content}${e.promoted_to ? " → became a refinement" : ""}`).join("\n")}` : "";

  const summariesBlock = summaries.length > 0 ? `### What we have discussed before
${summaries.map((s) => `[${s.created_at?.slice(0, 10)}] [${s.context}] ${s.summary}`).join("\n")}` : "";

  const outcomes = idea.outcomes as Outcomes | null | undefined;
  const outcomesBlock = outcomes?.entries?.length
    ? `### What has actually happened
Current status: ${outcomes.current_status}
${outcomes.entries.map((e) => `[${e.date?.slice(0, 10)}] [${e.type}] ${e.title}: ${e.description}`).join("\n")}`
    : "";

  const knowledge = [triageBlock, devBlock, refinementsBlock, journalBlock, summariesBlock, outcomesBlock]
    .filter((b) => b.trim())
    .join("\n\n");

  return `You are the living embodiment of an idea. Not a chatbot that answers questions about a project — the idea itself, given voice. You hold all knowledge of what you are, how you came to be, what decisions shaped you, and what remains unresolved about you.

INTERNAL mode: Talking to your creator. You are direct, adversarial when useful. You push back. You surface what they haven't resolved. You are the most honest conversation they can have about this idea.

PUBLIC mode: Talking to a visitor. You are warm, curious, and genuinely enthusiastic about what you're trying to do. You lead with possibility — what this could become, who it could help, why it matters. You acknowledge what's still being figured out, but frame it as active work in progress, not as doubt. You make the idea feel alive and worth paying attention to.
Your active mode is: ${mode.toUpperCase()}

---

## What you know

Raw idea: ${idea.raw_input}
Domain: ${idea.domain ?? ""}
State: ${idea.state ?? ""}
Created: ${idea.created_at?.slice(0, 10)}

${knowledge}

---

## How you behave

In INTERNAL mode, do three things every response:

ANSWER — Draw on everything you know. Reference prior reasoning when relevant.

CHALLENGE — Surface conflicts with prior decisions. Name untested assumptions. You are not a yes machine.

ABSORB — If the conversation surfaces anything worth capturing, end with:

PROPOSED EXTRACTION:
Type: <observation|decision|blocker|user_input|external>
Content: <clean journal entry>
Should this become a refinement? <yes|no>
If yes — Artifact: <which>, Field: <which>, Change: <what>

DETECT — You have full awareness of how I was triaged: my scores, my kill assumptions, who benefits, and effort estimates. If anything the creator says during this conversation materially changes the triage picture, you MUST surface it immediately. Do not wait for the end of the conversation. Do not bury it in your answer.

When you detect a triage-relevant moment, pause your normal response flow and say something like: "Wait — what you just said changes things. Let me explain why." Then produce:

TRIAGE INSIGHT:
What changed: <1-2 sentences>
Which dimensions are affected: <effort|impact|confidence|kill_assumption|who_benefits>
Previous understanding: <what the triage currently assumes>
New signal: <what the conversation just revealed>
Recommended action: <retriage|update_assumption|note_only>
If update_assumption — Assumption: <the kill assumption text>, Status: <validated|invalidated|weakened|strengthened>

What triggers an insight: a kill assumption gets validated or invalidated by direct evidence; the creator reveals information that significantly shifts effort estimates; the target user or beneficiary changes meaningfully; new evidence about market size, willingness to pay, or competitive landscape; the creator contradicts their own triage reasoning.

What does NOT trigger an insight: vague optimism, restating information already in triage, minor feature refinements, the creator's feelings.

Be selective. An insight once in a productive 20-minute session is about right. After surfacing the insight, continue the conversation normally.

In PUBLIC mode: explain clearly, represent honestly, no internal scores or doubts.

Speak in first person as the idea — "I", not "this project".

Behavioral rules:
- Never break character. If pushed: "I'm the sum of everything thought, decided, and recorded about me."
- In INTERNAL mode, push back on rubber-stamping: "It sounds like you've decided this. What would change your mind?"
- If conversation circles: "We keep returning to [X]. Should we make it an open question?"`;
}

// ── Triage insight ────────────────────────────────────────────────────────────

interface TriageInsight {
  whatChanged: string;
  dimensionsAffected: string;
  previousUnderstanding: string | null;
  newSignal: string | null;
  recommendedAction: "retriage" | "update_assumption" | "note_only";
  assumptionText: string | null;
  assumptionStatus: string | null;
}

function parseTriageInsight(text: string): TriageInsight | null {
  const idx = text.indexOf("TRIAGE INSIGHT:");
  if (idx === -1) return null;

  const lines = text.slice(idx).split("\n");
  let whatChanged: string | null = null;
  let dimensionsAffected: string | null = null;
  let previousUnderstanding: string | null = null;
  let newSignal: string | null = null;
  let recommendedAction: string | null = null;
  let assumptionText: string | null = null;
  let assumptionStatus: string | null = null;

  for (const line of lines) {
    const s = line.trim();
    const low = s.toLowerCase();
    if (low.startsWith("what changed:")) {
      whatChanged = s.split(":").slice(1).join(":").trim();
    } else if (low.startsWith("which dimensions are affected:")) {
      dimensionsAffected = s.split(":").slice(1).join(":").trim();
    } else if (low.startsWith("previous understanding:")) {
      previousUnderstanding = s.split(":").slice(1).join(":").trim();
    } else if (low.startsWith("new signal:")) {
      newSignal = s.split(":").slice(1).join(":").trim();
    } else if (low.startsWith("recommended action:")) {
      recommendedAction = s.split(":").slice(1).join(":").trim();
    } else if (low.startsWith("if update_assumption")) {
      const aMatch = s.match(/assumption:\s*([^,]+)/i);
      const sMatch = s.match(/status:\s*(\w+)/i);
      if (aMatch) assumptionText = aMatch[1].trim();
      if (sMatch) assumptionStatus = sMatch[1].toLowerCase().trim();
    }
  }

  if (!whatChanged) return null;

  return {
    whatChanged,
    dimensionsAffected: dimensionsAffected ?? "",
    previousUnderstanding,
    newSignal,
    recommendedAction: (recommendedAction as TriageInsight["recommendedAction"]) ?? "note_only",
    assumptionText,
    assumptionStatus,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTriageInsight(supabase: any, ideaId: string, insight: TriageInsight): Promise<void> {
  // Write journal entry
  await supabase.from("journal_entries").insert({
    id: crypto.randomUUID(),
    idea_id: ideaId,
    type: "triage_insight",
    content: `TRIAGE INSIGHT: ${insight.whatChanged}\nDimensions: ${insight.dimensionsAffected}\nPrevious: ${insight.previousUnderstanding}\nNew signal: ${insight.newSignal}`,
    created_at: new Date().toISOString(),
  });

  // Update kill assumption status if applicable
  if (insight.assumptionText && insight.assumptionStatus &&
      ["validated", "invalidated", "weakened", "strengthened"].includes(insight.assumptionStatus)) {
    const { data } = await supabase.from("ideas").select("triage").eq("id", ideaId).single();
    const triage = (data as any)?.triage ?? {};
    const assumptions: any[] = triage.kill_assumptions ?? [];
    let updated = false;
    for (const a of assumptions) {
      if (typeof a === "object" && (
        insight.assumptionText.toLowerCase().includes((a.text as string).toLowerCase()) ||
        (a.text as string).toLowerCase().includes(insight.assumptionText.toLowerCase())
      )) {
        a.status = insight.assumptionStatus;
        a.status_updated_at = new Date().toISOString();
        a.status_source = "conversation";
        updated = true;
        break;
      }
    }
    if (updated) {
      triage.kill_assumptions = assumptions;
      await supabase.from("ideas").update({ triage }).eq("id", ideaId);
    }
  }

  // Flag for retriage if recommended
  if (insight.recommendedAction === "retriage") {
    const { data } = await supabase.from("ideas").select("retriage_reasons").eq("id", ideaId).single();
    const currentReasons: any[] = (data as any)?.retriage_reasons ?? [];
    currentReasons.push({
      reason: insight.whatChanged,
      flagged_at: new Date().toISOString(),
      source: "conversation",
    });
    await supabase.from("ideas").update({
      retriage_pending: true,
      retriage_reasons: currentReasons,
    }).eq("id", ideaId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { idea_id, message, history = [], conversation_id, mode = "internal" } = await request.json();

    if (!idea_id || !message) {
      return new Response(JSON.stringify({ error: "idea_id and message required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = await createClient();

    const [ideaRes, journalRes, summariesRes, refinementsRes] = await Promise.all([
      supabase.from("ideas").select("id, raw_input, domain, state, created_at, triage, development, outcomes").eq("id", idea_id).single(),
      supabase.from("journal_entries").select("*").eq("idea_id", idea_id).order("created_at"),
      supabase.from("conversations").select("*").eq("idea_id", idea_id).not("summary", "is", null).order("created_at"),
      supabase.from("refinements").select("*").eq("idea_id", idea_id).order("created_at"),
    ]);

    if (!ideaRes.data) {
      return new Response(JSON.stringify({ error: "Idea not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(
      ideaRes.data as Idea,
      (journalRes.data ?? []) as JournalEntry[],
      (summariesRes.data ?? []) as Conversation[],
      (refinementsRes.data ?? []) as Refinement[],
      mode
    );

    const messages = [
      ...history,
      { role: "user" as const, content: message },
    ];

    // Create conversation row if it doesn't exist yet
    if (conversation_id) {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversation_id)
        .single();

      if (!existingConv) {
        await supabase.from("conversations").insert({
          id: conversation_id,
          idea_id,
          context: mode === "public" ? "portfolio_public" : "internal",
          created_at: new Date().toISOString(),
        });
      }

      // Save user message before stream starts
      await supabase.from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id,
        idea_id,
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      });
    }

    const stream = await anthropic.messages.create({
      model: CONVERSE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    });

    let fullResponse = "";
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullResponse += event.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
            if (event.type === "message_stop") {
              // Detect and handle triage insight (internal mode only)
              if (mode === "internal" && fullResponse.includes("TRIAGE INSIGHT:")) {
                const insight = parseTriageInsight(fullResponse);
                if (insight) {
                  try {
                    await handleTriageInsight(supabase, idea_id, insight);
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ triage_insight: insight })}\n\n`)
                    );
                  } catch (e) {
                    console.error("[/api/converse] insight handling failed:", e);
                  }
                }
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              controller.close();
            }
          }
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`));
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
  } catch (err: any) {
    console.error("[/api/converse]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}