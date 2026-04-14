export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ideaDisplayName, type Idea } from "@/lib/types";

// Server-side Supabase client (uses env vars at build/request time)
function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getIdeas(): Promise<Idea[]> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("ideas")
    .select("id, raw_input, domain, state, created_at, triage")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Idea[];
}

// ── Category pill ─────────────────────────────────────────────────────────────
const CATEGORY_STYLES: Record<number, { label: string; classes: string }> = {
  1: { label: "Cat 1", classes: "bg-green-100 text-green-800" },
  2: { label: "Cat 2", classes: "bg-amber-100 text-amber-800" },
  3: { label: "Cat 3", classes: "bg-gray-100 text-gray-700" },
  4: { label: "Cat 4", classes: "bg-red-100 text-red-700" },
};

function CategoryPill({ category }: { category?: number | null }) {
  if (!category) return null;
  const style = CATEGORY_STYLES[category];
  if (!style) return null;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${style.classes}`}>
      {style.label}
    </span>
  );
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < week) return `${Math.floor(diff / day)}d ago`;
  if (diff < month) return `${Math.floor(diff / week)}w ago`;
  if (diff < year) return `${Math.floor(diff / month)}mo ago`;
  return `${Math.floor(diff / year)}y ago`;
}

// ── Card ──────────────────────────────────────────────────────────────────────
function IdeaCard({ idea }: { idea: Idea }) {
  const name = ideaDisplayName(idea);
  const triage = idea.triage;
  const disposition = triage?.disposition;

  return (
    <Link
      href={`/ideas/${idea.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300 hover:shadow transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 leading-snug flex-1">
          {name}
        </h2>
        <CategoryPill category={triage?.category} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {disposition && (
          <span className="rounded border border-gray-200 px-2 py-0.5 font-medium capitalize">
            {disposition}
          </span>
        )}
        {idea.state && (
          <span className="rounded border border-gray-200 px-2 py-0.5 font-mono">
            {idea.state}
          </span>
        )}
        <span className="ml-auto">{relativeTime(idea.created_at)}</span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function IdeasPage() {
  let ideas: Idea[] = [];
  let fetchError: string | null = null;

  try {
    ideas = await getIdeas();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div className="min-h-screen bg-gray-50">
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KSM Studio</h1>
          <p className="mt-1 text-sm text-gray-500">Idea pipeline</p>
        </div>
        <Link
          href="/triage/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + New triage
        </Link>
      </div>

      {fetchError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-6">
          <strong>Error loading ideas:</strong> {fetchError}
        </div>
      )}

      {!fetchError && ideas.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">No ideas yet.</p>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Run <span className="bg-gray-100 px-1 rounded">python triage.py</span> to add your first idea.
          </p>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="grid gap-3">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
