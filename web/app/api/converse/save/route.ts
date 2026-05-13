import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, idea_id, content } = await request.json();
    if (!conversation_id || !idea_id || !content) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    const supabase = await createClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("idea_id", idea_id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return new Response(JSON.stringify({ error: "conversation not found" }), { status: 404 });
    }

    const { data: existingMessage, error: existingMessageError } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("idea_id", idea_id)
      .eq("role", "idea")
      .eq("content", content)
      .maybeSingle();

    if (existingMessageError) {
      return new Response(JSON.stringify({ error: "could not check saved message" }), { status: 500 });
    }

    if (existingMessage) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { error: insertError } = await supabase.from("messages").insert({
      id: crypto.randomUUID(),
      conversation_id,
      idea_id,
      role: "idea",
      content,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: "could not save message" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}