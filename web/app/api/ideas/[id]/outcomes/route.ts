import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { OutcomeEntry, Outcomes } from "@/lib/types";
import {
  applyOutcomesAction,
  outcomesVersionToken,
  type OutcomesAction,
} from "@/lib/outcomes/mutate";

const MAX_CAS_ATTEMPTS = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!["add_entry", "update_status", "delete_entry"].includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  let mutation: OutcomesAction;
  if (action === "add_entry") {
    const { entry } = body as { entry: Partial<OutcomeEntry> };
    if (!entry?.type || !entry?.title || !entry?.description) {
      return NextResponse.json({ error: "invalid entry" }, { status: 400 });
    }
    mutation = { action: "add_entry", entry };
  } else if (action === "update_status") {
    const { status } = body as { status: Outcomes["current_status"] };
    if (!status) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    mutation = { action: "update_status", status };
  } else {
    const { entry_id } = body as { entry_id: string };
    if (!entry_id) {
      return NextResponse.json({ error: "invalid entry_id" }, { status: 400 });
    }
    mutation = { action: "delete_entry", entry_id };
  }

  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: idea, error } = await supabase
      .from("ideas")
      .select("id, outcomes")
      .eq("id", id)
      .single();

    if (error || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const previous = idea.outcomes as Outcomes | null;
    const expectedToken = outcomesVersionToken(previous);
    const outcomes = applyOutcomesAction(previous, mutation);

    let update = supabase.from("ideas").update({ outcomes }).eq("id", id);

    // Compare-and-swap on the version token so a concurrent writer cannot
    // overwrite a fresher outcomes blob and silently drop entries.
    if (previous == null) {
      update = update.is("outcomes", null);
    } else if (expectedToken) {
      update = update.eq("outcomes->>status_updated_at", expectedToken);
    }
    // Legacy rows missing status_updated_at: best-effort write (no CAS).
    // The write stamps a token so subsequent updates are protected.

    const { data: updated, error: updateError } = await update.select("id");

    if (updateError) {
      console.error("outcomes update error:", updateError);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (updated && updated.length > 0) {
      return NextResponse.json({ ok: true, outcomes });
    }

    // Zero rows updated → another writer won the race; retry with fresh read.
  }

  return NextResponse.json(
    { error: "outcomes_conflict", message: "Concurrent outcomes update; retry." },
    { status: 409 },
  );
}
