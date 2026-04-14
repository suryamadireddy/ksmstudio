import type { Refinement } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RefinementsPanel({
  refinements,
}: {
  refinements: Refinement[];
}) {
  if (!refinements.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--studio-fg-muted)" }}>
        No refinements yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {refinements.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-bg-2)",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "var(--studio-bg-3)",
                color: "var(--studio-amber)",
              }}
            >
              {r.artifact}
            </span>
            {r.field_path && (
              <span
                className="text-[11px]"
                style={{
                  fontFamily: "var(--font-jetbrains, monospace)",
                  color: "var(--studio-fg-muted)",
                }}
              >
                {r.field_path}
              </span>
            )}
            <span
              className="ml-auto text-[11px]"
              style={{ color: "var(--studio-fg-muted)" }}
            >
              {formatDate(r.created_at)}
            </span>
          </div>

          {r.previous_value?.value && (
            <div className="mb-2">
              <p
                className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-fg-muted)" }}
              >
                Before
              </p>
              <p
                className="text-xs leading-relaxed line-through"
                style={{ color: "var(--studio-fg-muted)", opacity: 0.6 }}
              >
                {r.previous_value.value}
              </p>
            </div>
          )}

          {r.new_value?.value && (
            <div className="mb-3">
              <p
                className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                Now
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--studio-fg)" }}
              >
                {r.new_value.value}
              </p>
            </div>
          )}

          {r.reason && (
            <p
              className="border-t pt-3 text-xs leading-relaxed"
              style={{
                borderColor: "var(--studio-border)",
                color: "var(--studio-fg-muted)",
              }}
            >
              {r.reason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
