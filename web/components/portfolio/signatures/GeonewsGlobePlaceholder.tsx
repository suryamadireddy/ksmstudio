export function GeonewsGlobePlaceholder() {
  return (
    <div
      className="flex w-full flex-col items-center justify-center"
      style={{
        minHeight: "clamp(280px, 40vw, 400px)",
        background:
          "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 18%, var(--bg)) 0%, var(--bg) 72%)",
      }}
    >
      <p
        className="font-serif text-2xl font-normal tracking-tight md:text-4xl"
        style={{ color: "var(--fg)" }}
      >
        Five points. One day. One globe.
      </p>
      <p
        className="mt-4 font-mono text-xs"
        style={{ color: "var(--muted)" }}
      >
        — globe in development
      </p>
    </div>
  );
}
