export interface QuoteWallContent {
  quote: string;
  attribution?: string;
}

export function QuoteWall({ quote, attribution }: QuoteWallContent) {
  if (typeof quote !== "string") {
    return null;
  }

  return (
    <section className="py-20 md:py-40">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div className="mx-auto max-w-3xl">
          <span
            className="mb-4 block font-serif text-6xl leading-none select-none"
            style={{ color: "var(--accent)", opacity: 0.4 }}
            aria-hidden
          >
            &ldquo;
          </span>
          <blockquote>
            <p
              className="font-serif text-2xl font-normal leading-snug tracking-tight md:text-4xl lg:text-5xl"
              style={{ color: "var(--fg)" }}
            >
              {quote}
            </p>
            {attribution && (
              <footer
                className="mt-8 text-sm font-medium uppercase tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                {attribution}
              </footer>
            )}
          </blockquote>
        </div>
      </div>
    </section>
  );
}
