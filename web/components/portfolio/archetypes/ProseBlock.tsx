export interface ProseBlockContent {
  paragraphs: string[];
}

export function ProseBlock({ paragraphs }: ProseBlockContent) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div
          className="max-w-2xl space-y-6 border-l-2 pl-8 md:pl-10"
          style={{ borderColor: "var(--border)" }}
        >
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-lg font-normal leading-relaxed md:text-xl"
                  : "text-base leading-relaxed md:text-lg"
              }
              style={{ color: i === 0 ? "var(--fg)" : "var(--muted)" }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
