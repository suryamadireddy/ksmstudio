import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, idea_id } = await request.json();
    if (!conversation_id || !idea_id) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Fetch conversation — skip if already summarized
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, idea_id, summary")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "conversation not found" }), { status: 404 });
    }

    if (conversation.idea_id !== idea_id) {
      return new Response(JSON.stringify({ error: "conversation does not belong to idea" }), { status: 400 });
    }

    if (conversation.summary) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    // Fetch messages
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .eq("idea_id", idea_id)
      .order("created_at", { ascending: true });

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const lastMessage = messages[messages.length - 1];
    const hasIdeaResponse = messages.some((message) => message.role !== "user");
    if (!hasIdeaResponse || lastMessage.role === "user") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "incomplete" }), { status: 200 });
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
      .is("summary", null);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    console.error("[/api/converse/summarize]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
