import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { OutcomeEntry, Outcomes } from "@/lib/types";

const STATUS_FROM_TYPE: Partial<Record<OutcomeEntry["type"], Outcomes["current_status"]>> = {
  kill: "killed",
  launch: "launched",
  pause: "paused",
};

function currentStatusFromEntries(entries: OutcomeEntry[]): Outcomes["current_status"] {
  const latestStatusEntry = [...entries].reverse().find((entry) => STATUS_FROM_TYPE[entry.type]);
  return latestStatusEntry ? STATUS_FROM_TYPE[latestStatusEntry.type]! : "exploring";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!["add_entry", "update_status", "delete_entry"].includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id, outcomes")
    .eq("id", id)
    .single();

  if (error || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const outcomes: Outcomes = (idea.outcomes as Outcomes) ?? {
    entries: [],
    current_status: "exploring",
    status_updated_at: new Date().toISOString(),
  };

  if (action === "add_entry") {
    const { entry } = body as { entry: Partial<OutcomeEntry> };
    const newEntry: OutcomeEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      type: entry.type!,
      title: entry.title!,
      description: entry.description!,
      predicted_vs_actual: entry.predicted_vs_actual ?? null,
    };
    outcomes.entries.push(newEntry);
    const autoStatus = STATUS_FROM_TYPE[newEntry.type];
    if (autoStatus) outcomes.current_status = autoStatus;
    outcomes.status_updated_at = new Date().toISOString();

  } else if (action === "update_status") {
    const { status } = body as { status: Outcomes["current_status"] };
    outcomes.current_status = status;
    outcomes.status_updated_at = new Date().toISOString();

  } else if (action === "delete_entry") {
    const { entry_id } = body as { entry_id: string };
    const deletedEntry = outcomes.entries.find((e) => e.id === entry_id);
    outcomes.entries = outcomes.entries.filter((e) => e.id !== entry_id);
    const deletedStatus = deletedEntry ? STATUS_FROM_TYPE[deletedEntry.type] : null;
    if (deletedStatus && outcomes.current_status === deletedStatus) {
      outcomes.current_status = currentStatusFromEntries(outcomes.entries);
    }
    outcomes.status_updated_at = new Date().toISOString();
  }

  await supabase.from("ideas").update({ outcomes }).eq("id", id);
  return NextResponse.json({ ok: true, outcomes });
}
