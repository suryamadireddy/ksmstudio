import Link from "next/link";
import { ideaDisplayName, type Idea } from "@/lib/types";
import { CATEGORY_LABEL } from "@/types";

const OUTCOME_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "active",    color: "#60a5fa", bg: "rgba(96,165,250,0.10)" },
  paused:    { label: "paused",    color: "#f0b429", bg: "rgba(240,180,41,0.10)" },
  killed:    { label: "killed",    color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  launched:  { label: "launched",  color: "#4ade80", bg: "rgba(74,222,128,0.10)" },
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = 60_000, h = 3_600_000, d = 86_400_000, w = 7 * d;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  if (diff < w) return `${Math.floor(diff / d)}d ago`;
  return `${Math.floor(diff / w)}w ago`;
}

const DISPOSITION_STYLE: Record<string, { color: string; bg: string }> = {
  pursue:    { color: "#4ade80", bg: "rgba(74,222,128,0.08)" },
  potential: { color: "#f0b429", bg: "rgba(240,180,41,0.10)" },
  park:      { color: "#6b7280", bg: "rgba(107,114,128,0.08)" },
  discard:   { color: "#6b6560", bg: "rgba(107,101,96,0.06)" },
};

const DISPOSITION_LABEL: Record<string, string> = {
  pursue: "pursue", potential: "potential", park: "park", discard: "discard",
};

function mobilityBadge(t: Idea["triage"]): string | null {
  if (!t) return null;
  const history = t.triage_history;
  if (!history || history.length === 0) return null;
  const original = history[0];
  if (!original || original.disposition === t.disposition) return null;
  return `${DISPOSITION_LABEL[original.disposition] ?? original.disposition} → ${DISPOSITION_LABEL[t.disposition] ?? t.disposition}`;
}

export default function IdeaCard({ idea }: { idea: Idea }) {
  const name = ideaDisplayName(idea);
  const t = idea.triage;
  const disposition = t?.disposition;
  const ds = disposition ? DISPOSITION_STYLE[disposition] : null;
  const mobility = mobilityBadge(t);
  const outcomeStatus = idea.outcomes?.current_status;
  const outcomeBadge = outcomeStatus && outcomeStatus !== "exploring" ? OUTCOME_STATUS_STYLE[outcomeStatus] : null;

  return (
    <Link
      href={`/studio/ideas/${idea.id}`}
      className="idea-card group block rounded-xl border p-5 transition-colors"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "var(--studio-bg-2)",
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2
          className="text-base font-normal leading-snug"
          style={{
            fontFamily: "var(--font-playfair, Georgia, serif)",
            color: "var(--studio-fg)",
          }}
        >
          {name}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {idea.published && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "#4ade80" }}
              title="Published"
            />
          )}
          {disposition && ds && (
            <span
              className="rounded px-2 py-0.5 text-[11px] font-medium capitalize"
              style={{ color: ds.color, backgroundColor: ds.bg }}
            >
              {disposition}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {t?.category && (
          <span
            className="rounded border px-2 py-0.5 text-[11px]"
            style={{
              borderColor: "var(--studio-border)",
              color: "var(--studio-fg-muted)",
            }}
          >
            Cat {t.category} · {CATEGORY_LABEL[t.category]}
          </span>
        )}
        {idea.state && (
          <span
            className="rounded px-2 py-0.5 text-[11px]"
            style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              backgroundColor: "var(--studio-bg-3)",
              color: "var(--studio-fg-muted)",
            }}
          >
            {idea.state}
          </span>
        )}
        {t && (
          <span
            className="text-[11px]"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            ↑{t.impact_score} effort {t.effort_score}
          </span>
        )}
        {mobility && (
          <span
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              color: "var(--studio-amber-dim)",
              backgroundColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.06)",
            }}
          >
            ↑ {mobility}
          </span>
        )}
        {idea.retriage_pending && (
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: "var(--studio-amber)",
              backgroundColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.10)",
            }}
          >
            ⚡ re-triage
          </span>
        )}
        {outcomeBadge && (
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium capitalize"
            style={{ color: outcomeBadge.color, backgroundColor: outcomeBadge.bg }}
          >
            {outcomeBadge.label}
          </span>
        )}
        <span
          className="ml-auto text-[11px]"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          {relativeTime(idea.created_at)}
        </span>
      </div>
    </Link>
  );
}
