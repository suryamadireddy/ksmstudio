export interface TimelineEntry {
  date: string;
  title: string;
  body: string;
}

export interface TimelineContent {
  entries: TimelineEntry[];
}

export function Timeline({ entries }: TimelineContent) {
  if (
    !entries ||
    !Array.isArray(entries) ||
    entries.some(
      (e) =>
        !e ||
        typeof e.date !== "string" ||
        typeof e.title !== "string" ||
        typeof e.body !== "string",
    )
  ) {
    return null;
  }

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <p
          className="mb-12 text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--accent)" }}
        >
          Timeline
        </p>
        <div
          className="relative border-l"
          style={{ borderColor: "var(--border)" }}
        >
          {entries.map((entry, i) => (
            <div key={i} className="relative mb-12 pl-10 last:mb-0">
              <span
                className="absolute -left-2 mt-1.5 h-4 w-4 rounded-full border-2"
                style={{
                  borderColor: "var(--accent)",
                  backgroundColor: "var(--bg)",
                }}
              />
              <p
                className="mb-2 font-mono text-xs tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                {entry.date}
              </p>
              <p
                className="mb-2 font-serif text-xl font-normal leading-tight"
                style={{ color: "var(--fg)" }}
              >
                {entry.title}
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {entry.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
