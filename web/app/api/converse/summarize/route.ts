import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, idea_id } = await request.json();
    if (!conversation_id || !idea_id) {
      return jsonResponse({ error: "missing fields" }, 400);
    }

    const supabase = await createClient();

    // Fetch conversation — skip if already summarized
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, summary")
      .eq("id", conversation_id)
      .eq("idea_id", idea_id)
      .single();

    if (convError || !conversation) {
      return jsonResponse({ error: "conversation not found" }, 404);
    }

    if (conversation.summary) {
      return jsonResponse({ ok: true, skipped: true }, 200);
    }

    // Fetch messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[/api/converse/summarize] messages fetch failed", messagesError);
      return jsonResponse({ error: "Could not load conversation messages" }, 500);
    }

    if (!messages || messages.length === 0) {
      return jsonResponse({ ok: true, skipped: true }, 200);
    }

    // Build prompt
    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const prompt = `Summarize this product idea conversation in exactly this format:

What was discussed: <2-3 sentences describing the main topics>
Decisions made: <bullet list of any decisions reached, or "none">
Open questions raised: <bullet list of unresolved questions, or "none">
Extractions confirmed: <bullet list of any idea fields or facts confirmed, or "none">

Keep each section concise. Do not add any other sections or commentary.

CONVERSATION:
${transcript}`;

    // Call Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const summary =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Save to conversations.summary
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ summary })
      .eq("id", conversation_id)
      .eq("idea_id", idea_id)
      .select("id")
      .single();

    if (updateError) {
      console.error("[/api/converse/summarize] summary update failed", updateError);
      return jsonResponse({ error: "Could not save conversation summary" }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err: any) {
    console.error("[/api/converse/summarize]", err);
    return jsonResponse({ error: err.message }, 500);
  }
}
