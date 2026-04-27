import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: {
    idea_id: string;
    type: string;
    content: string;
    is_refinement?: boolean;
    artifact?: string | null;
    field_path?: string | null;
    change?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { idea_id, type, content, is_refinement, artifact, field_path, change } = body;

  if (!idea_id || !type || !content) {
    return new Response(
      JSON.stringify({ error: "idea_id, type, and content are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const journal_id = crypto.randomUUID();

  // Insert journal entry
  const { error: journalError } = await supabase.from("journal_entries").insert({
    id: journal_id,
    idea_id,
    type,
    content,
    created_at: now,
  });

  if (journalError) {
    return new Response(JSON.stringify({ error: journalError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // If it's also a refinement, write that row and back-link the journal entry
  if (is_refinement && artifact && field_path && change) {
    const refinement_id = crypto.randomUUID();

    const { error: refError } = await supabase.from("refinements").insert({
      id: refinement_id,
      idea_id,
      triggered_by: journal_id,
      artifact,
      field_path,
      new_value: { value: change },
      reason: content,
      created_at: now,
    });

    if (refError) {
      return new Response(JSON.stringify({ error: refError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Back-link journal entry to the refinement
    await supabase
      .from("journal_entries")
      .update({ promoted_to: refinement_id })
      .eq("id", journal_id);

    return new Response(
      JSON.stringify({ ok: true, journal_id, refinement_id }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, journal_id }),
    { headers: { "Content-Type": "application/json" } }
  );
}
