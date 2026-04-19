import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { idea_id } = await request.json();
    if (!idea_id) {
      return new Response(JSON.stringify({ error: "idea_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = await createClient();
    await supabase
      .from("ideas")
      .update({ retriage_pending: false, retriage_reasons: [] })
      .eq("id", idea_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
