export interface StatementContent {
  text: string;
}

export function Statement({ text }: StatementContent) {
  return (
    <section className="py-20 md:py-48">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div
          className="mb-8 h-px w-12"
          style={{ backgroundColor: "var(--accent)" }}
        />
        <p
          className="font-serif text-4xl font-normal leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
          style={{ color: "var(--fg)" }}
        >
          {text}
        </p>
      </div>
    </section>
  );
}
