import type { JournalEntry } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_COLOR: Record<string, string> = {
  observation: "var(--studio-fg-muted)",
  decision: "var(--studio-amber)",
  blocker: "var(--studio-red)",
  user_input: "var(--studio-green)",
  external: "var(--studio-amber-dim)",
};

export default function JournalPanel({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--studio-fg-muted)" }}>
        No journal entries yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-bg-2)",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                color: TYPE_COLOR[entry.type] ?? "var(--studio-fg-muted)",
                backgroundColor: "var(--studio-bg-3)",
              }}
            >
              {entry.type}
            </span>
            {entry.promoted_to && (
              <span
                className="text-[10px]"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                → promoted to refinement
              </span>
            )}
            <span
              className="ml-auto text-[11px]"
              style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                color: "var(--studio-fg-muted)",
              }}
            >
              {formatDate(entry.created_at)}
            </span>
          </div>
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            {entry.content}
          </p>
        </div>
      ))}
    </div>
  );
}
