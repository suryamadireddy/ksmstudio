export function Closing() {
  return (
    <section
      id="about"
      className="flex min-h-[calc(100svh-4.5rem-10svh)] items-center px-6 py-24 md:py-32"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Philosophy
          </p>
          <blockquote className="font-serif text-2xl font-normal leading-relaxed tracking-tight text-foreground md:text-3xl lg:text-4xl">
            Building thoughtful products with clarity, structure, and taste.
          </blockquote>
          <p className="mt-8 text-muted-foreground">
            Every project begins with deep understanding and ends with actionable direction -
            grounded in research, shaped by strategy, and refined through iteration.
          </p>
        </div>
      </div>
    </section>
  )
}
