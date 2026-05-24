import type { Idea, Persona } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber-dim)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "var(--studio-amber-dim)" }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  must: "var(--studio-green)",
  should: "var(--studio-amber)",
  could: "var(--studio-fg-muted)",
  wont: "var(--studio-red)",
};

export default function ArtifactPanel({ idea }: { idea: Idea }) {
  const d = idea.development;
  const prd = d?.prd;
  const mvp = d?.mvp_scope;
  const next = d?.next_steps;
  const personas: Persona[] = (() => {
    const raw = d?.personas as Persona[] | string | undefined;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw) as Persona[]; } catch { return []; }
    }
    return [];
  })();

  if (!prd && !mvp && !next && !personas.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--studio-fg-muted)" }}>
        No artifacts yet. Run the development pipeline to generate PRD, personas, and MVP scope.
      </p>
    );
  }

  return (
    <div>
      {personas.length > 0 && (
        <Section title={`Personas (${personas.length})`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {personas.map((p, i) => (
              <div
                key={i}
                className="rounded-lg border p-4"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-bg-3)",
                }}
              >
                <p className="mb-1 text-sm font-medium" style={{ color: "var(--studio-fg)" }}>
                  {p.label}
                </p>
                <p className="mb-3 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                  {p.description}
                </p>
                <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                  <span style={{ color: "var(--studio-amber-dim)" }}>Pain: </span>
                  {p.pain}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                  <span style={{ color: "var(--studio-amber-dim)" }}>Gain: </span>
                  {p.gain}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {prd && (
        <Section title="PRD">
          <div
            className="space-y-5 rounded-lg border p-5"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
          >
            {prd.problem && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Problem</p>
                <Prose>{prd.problem}</Prose>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Solution</p>
              <Prose>{prd.solution}</Prose>
            </div>
            {prd.user_stories?.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>User Stories</p>
                <BulletList items={prd.user_stories} />
              </div>
            )}
            {prd.success_metrics?.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Success Metrics</p>
                <BulletList items={prd.success_metrics} />
              </div>
            )}
            {prd.out_of_scope?.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Out of Scope</p>
                <BulletList items={prd.out_of_scope} />
              </div>
            )}
            {prd.red_flags && prd.red_flags.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-red)" }}>Red Flags</p>
                <BulletList items={prd.red_flags} />
              </div>
            )}
          </div>
        </Section>
      )}

      {mvp && (
        <Section title="MVP Scope">
          <div
            className="space-y-5 rounded-lg border p-5"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
          >
            {mvp.effort_estimate && (
              <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                <span style={{ color: "var(--studio-amber-dim)" }}>Effort estimate: </span>
                {mvp.effort_estimate}
              </p>
            )}
            {mvp.features && mvp.features.length > 0 && (
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Features</p>
                <div className="space-y-3">
                  {mvp.features.map((f, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--studio-fg)" }}>{f.name}</p>
                        {f.description && (
                          <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>{f.description}</p>
                        )}
                      </div>
                      {f.priority && (
                        <span
                          className="shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase"
                          style={{
                            borderColor: "var(--studio-border)",
                            color: PRIORITY_COLOR[f.priority] ?? "var(--studio-fg-muted)",
                          }}
                        >
                          {f.priority}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mvp.build_sequence?.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Build Sequence</p>
                <ol className="space-y-1.5">
                  {mvp.build_sequence.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
                      <span style={{ fontFamily: "var(--font-jetbrains, monospace)", color: "var(--studio-amber-dim)", fontSize: "11px" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Section>
      )}

      {next && (
        <Section title="Next Steps">
          <div
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>First action</p>
            <p className="mb-4 text-sm" style={{ color: "var(--studio-fg)" }}>{next.first_action}</p>
            {next.critical_path && (
              <>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>Critical path</p>
                <p className="text-sm" style={{ color: "var(--studio-fg-muted)" }}>{next.critical_path}</p>
              </>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
