import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, idea_id, content } = await request.json();
    if (!conversation_id || !idea_id || !content) {
      return jsonResponse({ error: "missing fields" }, 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("idea_id", idea_id)
      .single();

    if (convError || !conversation) {
      return jsonResponse({ error: "conversation not found" }, 404);
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
      return jsonResponse({ error: insertError.message }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
}