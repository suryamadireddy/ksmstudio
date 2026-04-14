export default function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border py-24 text-center"
      style={{ borderColor: "var(--studio-border)" }}
    >
      <p
        className="mb-1 text-sm"
        style={{ color: "var(--studio-fg-muted)" }}
      >
        No ideas yet.
      </p>
      <p
        className="font-mono text-xs"
        style={{
          color: "var(--studio-fg-muted)",
          fontFamily: "var(--font-jetbrains, monospace)",
        }}
      >
        Run{" "}
        <code
          className="rounded px-1.5 py-0.5"
          style={{ backgroundColor: "var(--studio-bg-3)" }}
        >
          python triage.py
        </code>{" "}
        to add your first idea.
      </p>
    </div>
  );
}
