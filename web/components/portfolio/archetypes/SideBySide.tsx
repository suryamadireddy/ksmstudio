export interface SideBySidePanel {
  label: string;
  body: string;
}

export interface SideBySideContent {
  left: SideBySidePanel;
  right: SideBySidePanel;
}

export function SideBySide({ left, right }: SideBySideContent) {
  if (
    !left ||
    !right ||
    typeof left.label !== "string" ||
    typeof left.body !== "string" ||
    typeof right.label !== "string" ||
    typeof right.body !== "string"
  ) {
    return null;
  }

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div className="grid gap-px md:grid-cols-2" style={{ backgroundColor: "var(--border)" }}>
          {[left, right].map((panel, i) => (
            <div key={i} className="px-8 py-10" style={{ backgroundColor: "var(--surface)" }}>
              <p
                className="mb-3 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                {panel.label}
              </p>
              <p
                className="text-base leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {panel.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
