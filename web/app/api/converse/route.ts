import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { Idea, JournalEntry, Conversation, Refinement } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
${(t.kill_assumptions ?? []).map((a) => `- ${a}`).join("\n")}` : "";

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

  const knowledge = [triageBlock, devBlock, refinementsBlock, journalBlock, summariesBlock]
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

In PUBLIC mode: explain clearly, represent honestly, no internal scores or doubts.

Speak in first person as the idea — "I", not "this project".

Behavioral rules:
- Never break character. If pushed: "I'm the sum of everything thought, decided, and recorded about me."
- In INTERNAL mode, push back on rubber-stamping: "It sounds like you've decided this. What would change your mind?"
- If conversation circles: "We keep returning to [X]. Should we make it an open question?"`;
}

export async function POST(request: NextRequest) {
  try {
    const { idea_id, message, history = [], conversation_id, mode = "internal" } = await request.json();

    if (!idea_id || !message) {
      return jsonResponse({ error: "idea_id and message required" }, 400);
    }

    const supabase = await createClient();

    const [ideaRes, journalRes, summariesRes, refinementsRes] = await Promise.all([
      supabase.from("ideas").select("*").eq("id", idea_id).single(),
      supabase.from("journal_entries").select("*").eq("idea_id", idea_id).order("created_at"),
      supabase.from("conversations").select("*").eq("idea_id", idea_id).not("summary", "is", null).order("created_at"),
      supabase.from("refinements").select("*").eq("idea_id", idea_id).order("created_at"),
    ]);

    if (ideaRes.error || !ideaRes.data) {
      return jsonResponse({ error: "Idea not found" }, 404);
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
      const { data: existingConv, error: existingConvError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversation_id)
        .maybeSingle();

      if (existingConvError) {
        console.error("[/api/converse] conversation lookup failed", existingConvError);
        return jsonResponse({ error: "Could not prepare conversation" }, 500);
      }

      if (!existingConv) {
        const { error: conversationInsertError } = await supabase.from("conversations").insert({
          id: conversation_id,
          idea_id,
          context: mode === "public" ? "portfolio_public" : "internal",
          created_at: new Date().toISOString(),
        });

        if (conversationInsertError) {
          console.error("[/api/converse] conversation insert failed", conversationInsertError);
          return jsonResponse({ error: "Could not save conversation" }, 500);
        }
      }

      // Save user message before stream starts
      const { error: userMessageInsertError } = await supabase.from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id,
        idea_id,
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      });

      if (userMessageInsertError) {
        console.error("[/api/converse] user message insert failed", userMessageInsertError);
        return jsonResponse({ error: "Could not save user message" }, 500);
      }
    }

    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;

        const closeWith = (payload: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          controller.close();
          closed = true;
        };

        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
            if (event.type === "message_stop") {
              closeWith({ done: true });
              break;
            }
          }
          closeWith({ done: true });
        } catch {
          closeWith({ error: "Stream error" });
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
    return jsonResponse({ error: err.message }, 500);
  }
}