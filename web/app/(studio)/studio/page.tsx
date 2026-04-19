export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ideaDisplayName, type Idea } from "@/lib/types";
import IdeaCard from "../_components/IdeaCard";
import EmptyState from "../_components/EmptyState";

const DISPOSITION_ORDER: Record<string, number> = {
  pursue:    0,
  potential: 1,
  park:      2,
  discard:   3,
};

export default async function StudioPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ideas")
    .select("id, raw_input, domain, state, created_at, triage_version, retriage_pending, published, triage, outcomes")
    .order("retriage_pending", { ascending: false })
    .order("created_at", { ascending: false });

  const ideas: Idea[] = (data ?? []) as Idea[];

  // Sort: pursue first, then by created_at
  ideas.sort((a, b) => {
    const da = DISPOSITION_ORDER[a.triage?.disposition ?? ""] ?? 99;
    const db = DISPOSITION_ORDER[b.triage?.disposition ?? ""] ?? 99;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const counts = {
    pursue: ideas.filter((i) => i.triage?.disposition === "pursue").length,
    park: ideas.filter((i) => i.triage?.disposition === "park").length,
    total: ideas.length,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1
            className="mb-1 text-3xl font-normal"
            style={{ fontFamily: "var(--font-playfair, Georgia, serif)", color: "var(--studio-fg)" }}
          >
            Ideas
          </h1>
          {ideas.length > 0 && (
            <p className="text-sm" style={{ color: "var(--studio-fg-muted)" }}>
              {counts.total} total · {counts.pursue} pursuing · {counts.park} parked
            </p>
          )}
        </div>

        <Link
          href="/studio/triage/new"
          className="shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: "var(--studio-amber)",
            color: "var(--studio-bg)",
          }}
        >
          + New Idea
        </Link>
      </div>

      {error && (
        <div
          className="mb-6 rounded border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(248,113,113,0.3)", color: "#f87171", backgroundColor: "rgba(248,113,113,0.05)" }}
        >
          {error.message}
        </div>
      )}

      {ideas.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
