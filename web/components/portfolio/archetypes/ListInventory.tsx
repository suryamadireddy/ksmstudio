export interface ListInventoryItem {
  label: string;
  body: string;
}

export interface ListInventoryContent {
  items: ListInventoryItem[];
}

export function ListInventory({ items }: ListInventoryContent) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div>
          {items.map((item, i) => (
            <div
              key={i}
              className="grid gap-4 border-t py-8 md:grid-cols-[1fr_2fr]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="shrink-0 font-mono text-xs tabular-nums"
                  style={{ color: "var(--accent)", paddingTop: "2px" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p
                  className="text-sm font-medium leading-snug"
                  style={{ color: "var(--fg)" }}
                >
                  {item.label}
                </p>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {item.body}
              </p>
            </div>
          ))}
          <div
            className="border-t"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>
    </section>
  );
}
