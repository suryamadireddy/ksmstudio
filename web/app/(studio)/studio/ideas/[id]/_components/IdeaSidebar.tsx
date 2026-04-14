import type { Idea } from "@/lib/types";
import { CATEGORY_LABEL } from "@/types";

function ScoreBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <div
          className="h-1 w-16 rounded-full"
          style={{ backgroundColor: "var(--studio-bg-3)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              backgroundColor: "var(--studio-amber)",
            }}
          />
        </div>
        <span
          className="w-6 text-right text-[11px]"
          style={{
            fontFamily: "var(--font-jetbrains, monospace)",
            color: "var(--studio-fg-muted)",
          }}
        >
          {value}/{max}
        </span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p
        className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber-dim)" }}
      >
        {label}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>
        {value}
      </p>
    </div>
  );
}

const DISPOSITION_COLOR: Record<string, string> = {
  pursue: "var(--studio-green)",
  park: "var(--studio-amber)",
  kill: "var(--studio-red)",
  discard: "var(--studio-fg-muted)",
};

export default function IdeaSidebar({ idea }: { idea: Idea }) {
  const t = idea.triage;

  return (
    <aside
      className="rounded-xl border p-5"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "var(--studio-bg-2)",
      }}
    >
      {t ? (
        <>
          {t.disposition && (
            <div className="mb-5">
              <p
                className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                Disposition
              </p>
              <span
                className="text-sm font-medium capitalize"
                style={{ color: DISPOSITION_COLOR[t.disposition] ?? "var(--studio-fg)" }}
              >
                {t.disposition}
              </span>
            </div>
          )}

          <div className="mb-5 space-y-2">
            <ScoreBar label="Impact" value={t.impact_score} />
            <ScoreBar label="Effort" value={t.effort_score} />
            <ScoreBar label="Confidence" value={t.confidence} />
          </div>

          {t.category && (
            <Field
              label="Category"
              value={`${t.category} — ${CATEGORY_LABEL[t.category] ?? ""}`}
            />
          )}
          {t.time_horizon && (
            <Field label="Time horizon" value={t.time_horizon} />
          )}
          {t.provisional && (
            <Field label="Provisional" value="Yes — confidence too low to commit" />
          )}
          {t.triaged_at && (
            <Field
              label="Triaged"
              value={new Date(t.triaged_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
          )}
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
          Not yet triaged.
        </p>
      )}

      {idea.state && (
        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--studio-border)" }}>
          <Field
            label="State"
            value={
              <code style={{ fontFamily: "var(--font-jetbrains, monospace)" }}>
                {idea.state}
              </code>
            }
          />
        </div>
      )}

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--studio-border)" }}>
        <Field
          label="Created"
          value={new Date(idea.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        />
        <p
          className="mt-3 text-[10px]"
          style={{
            fontFamily: "var(--font-jetbrains, monospace)",
            color: "var(--studio-border-strong)",
          }}
        >
          {idea.id}
        </p>
      </div>
    </aside>
  );
}
