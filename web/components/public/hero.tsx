export function Hero() {
  return (
    <section className="relative flex h-[calc(100svh-4.5rem-10svh)] min-h-[26rem] flex-col justify-center px-6 pt-8 md:px-8 md:pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground md:mb-6">
            AI Product Studio
          </p>

          <h1 className="font-serif text-3xl font-normal leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Where ideas become research-backed products
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:mt-8 md:text-xl">
            Product strategy, AI-powered workflows, and design thinking —
            synthesized into PRDs, prototype directions, and interactive explainers.
          </p>
        </div>
      </div>
    </section>
  );
}
