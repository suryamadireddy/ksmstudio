export interface DataPanelItem {
  label: string;
  value: string;
  note?: string;
}

export interface DataPanelContent {
  items: DataPanelItem[];
}

export function DataPanel({ items = [] }: Partial<DataPanelContent>) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div className="grid grid-cols-2 gap-px md:grid-cols-4" style={{ backgroundColor: "var(--border)" }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="px-6 py-8"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <p
                className="mb-1 font-mono text-3xl font-normal"
                style={{ color: "var(--accent)" }}
              >
                {item.value}
              </p>
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                {item.label}
              </p>
              {item.note && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  {item.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
