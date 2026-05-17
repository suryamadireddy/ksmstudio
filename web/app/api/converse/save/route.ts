import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

function jsonResponse(body: unknown, status: number) {
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
    const { error } = await supabase.from("messages").insert({
      id: crypto.randomUUID(),
      conversation_id,
      idea_id,
      role: "idea",
      content,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[/api/converse/save] message insert failed", error);
      return jsonResponse({ error: "Could not save idea message" }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
}