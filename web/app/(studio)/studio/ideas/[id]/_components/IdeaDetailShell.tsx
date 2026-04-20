"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ideaDisplayName,
  type Idea,
  type JournalEntry,
  type Refinement,
  type Conversation,
  type Message,
} from "@/lib/types";
import IdeaSidebar from "./IdeaSidebar";
import ArtifactPanel from "./ArtifactPanel";
import JournalPanel from "./JournalPanel";
import RefinementsPanel from "./RefinementsPanel";
import ConversationsPanel from "./ConversationsPanel";
import OutcomesPanel from "./OutcomesPanel";
import PublishToggle from "./PublishToggle";
import { WorkspaceTab } from "./WorkspaceTab";

type Tab =
  | "overview"
  | "artifacts"
  | "journal"
  | "refinements"
  | "conversations"
  | "outcomes"
  | "workspace";

const TABS: { id: Tab; label: string; requiresDev?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "artifacts", label: "Artifacts" },
  { id: "outcomes", label: "Outcomes" },
  { id: "journal", label: "Journal" },
  { id: "refinements", label: "Refinements" },
  { id: "conversations", label: "Conversations" },
  { id: "workspace", label: "Workspace", requiresDev: true },
];

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-sm leading-relaxed"
      style={{ color: "var(--studio-fg-muted)" }}
    >
      {children}
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  validated:    { label: "✓", color: "#4ade80" },
  invalidated:  { label: "✗", color: "#f87171" },
  weakened:     { label: "⚠", color: "#f0b429" },
  strengthened: { label: "↑", color: "#4ade80" },
};

function KillAssumptionList({ items }: { items: Array<{ text: string; status: string } | string> }) {
  if (!items.length) return <Prose>None listed.</Prose>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const text = typeof item === "object" ? item.text : item;
        const status = typeof item === "object" ? item.status : "untested";
        const badge = STATUS_STYLES[status];
        return (
          <li
            key={i}
            className="flex gap-2 text-sm"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            <span
              className="mt-2 h-1 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--studio-amber-dim)" }}
            />
            <span>{text}</span>
            {badge && (
              <span className="ml-1 text-xs font-semibold" style={{ color: badge.color }}>
                {badge.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <Prose>None listed.</Prose>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-2 text-sm"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          <span
            className="mt-2 h-1 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--studio-amber-dim)" }}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

const DISPOSITION_COLOR: Record<string, string> = {
  pursue:    "#4ade80",
  potential: "#f0b429",
  park:      "#6b7280",
  discard:   "#f87171",
};

function TriageHistorySection({ idea }: { idea: Idea }) {
  const [open, setOpen] = useState(false);
  const t = idea.triage;
  const history = t?.triage_history ?? [];
  if (history.length === 0) return null;

  return (
    <Section title="Triage History">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs transition-colors"
        style={{ color: "var(--studio-fg-muted)" }}
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        {history.length} prior version{history.length !== 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {[...history].reverse().map((snap, i) => {
            const isLatest = i === 0;
            const nextSnap = isLatest ? t : [...history].reverse()[i - 1];
            const catDelta =
              nextSnap && snap.category !== nextSnap.category
                ? `${snap.category} → ${nextSnap?.category}`
                : null;
            const dispColor = DISPOSITION_COLOR[snap.disposition] ?? "var(--studio-fg-muted)";
            return (
              <div
                key={snap.triage_version}
                className="rounded border p-3"
                style={{ borderColor: "var(--studio-border)" }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold" style={{ color: "var(--studio-fg)" }}>
                    v{snap.triage_version}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
                    {snap.triaged_at ? new Date(snap.triaged_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
                    effort {snap.effort_score} · impact {snap.impact_score} · conf {snap.confidence}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium capitalize"
                    style={{ color: dispColor, backgroundColor: `color-mix(in srgb, ${dispColor} 12%, transparent)` }}
                  >
                    {snap.disposition}
                  </span>
                  {catDelta && (
                    <span className="text-[11px]" style={{ color: "var(--studio-amber-dim)" }}>
                      cat {catDelta}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function RetriagePendingSection({ idea }: { idea: Idea }) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);
  const reasons = idea.retriage_reasons ?? [];

  if (!idea.retriage_pending || reasons.length === 0) return null;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await fetch("/api/ideas/dismiss-retriage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: idea.id }),
      });
      router.refresh();
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div
      className="mb-6 rounded border p-4"
      style={{
        borderColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.4)",
        backgroundColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.05)",
      }}
    >
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber)" }}
      >
        ⚡ Re-triage suggested
      </p>
      <div className="mb-3 space-y-2">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "var(--studio-amber-dim)" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--studio-fg)" }}>
                &ldquo;{r.reason}&rdquo;
              </p>
              <p className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
                flagged {r.flagged_at ? new Date(r.flagged_at).toLocaleDateString() : ""} · {r.source}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Link
          href={`/studio/ideas/${idea.id}/retriage`}
          className="rounded px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
        >
          Re-triage now →
        </Link>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="rounded px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          {dismissing ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

function OverviewTab({ idea }: { idea: Idea }) {
  const t = idea.triage;
  const d = idea.development;
  return (
    <div>
      <RetriagePendingSection idea={idea} />
      <Section title="Original Idea">
        <Prose>{idea.raw_input}</Prose>
      </Section>
      {t?.triage_reasoning && (
        <Section title="Triage Reasoning">
          <Prose>{t.triage_reasoning}</Prose>
        </Section>
      )}
      {t?.growth_observations && (
        <Section title="Growth Notes">
          <div
            className="rounded-md border-l-2 py-2 pl-4"
            style={{ borderColor: "var(--studio-amber-dim)" }}
          >
            <Prose>{t.growth_observations}</Prose>
          </div>
        </Section>
      )}
      {t?.who_benefits && (
        <Section title="Who Benefits">
          <Prose>{t.who_benefits}</Prose>
        </Section>
      )}
      {t?.kill_assumptions && t.kill_assumptions.length > 0 && (
        <Section title="Kill Assumptions">
          <KillAssumptionList items={t.kill_assumptions} />
        </Section>
      )}
      <TriageHistorySection idea={idea} />
      {d?.problem_statement && (
        <Section title="Problem Statement">
          <Prose>{d.problem_statement}</Prose>
        </Section>
      )}
      {d?.core_hypothesis && (
        <Section title="Core Hypothesis">
          <Prose>{d.core_hypothesis}</Prose>
        </Section>
      )}
      {d?.research_synthesis && (
        <Section title="Research Synthesis">
          <Prose>{d.research_synthesis}</Prose>
        </Section>
      )}
      {d?.open_questions && d.open_questions.length > 0 && (
        <Section title="Open Questions">
          <BulletList items={d.open_questions} />
        </Section>
      )}
    </div>
  );
}

// ── Pipeline trigger banner ───────────────────────────────────────────────────

interface SearchLine { query: string; done: boolean }

function extractSummaryBullets(text: string): string[] {
  // Pull the Research synthesis section first
  const synthMatch = text.match(/###\s+Research\s+synthesis\s*\n([\s\S]*?)(?=###)/i);
  const source = synthMatch ? synthMatch[1] : text;
  // Split on sentence endings, keep first 3 non-trivial sentences
  const sentences = source
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && !s.startsWith("#"));
  if (sentences.length > 0) return sentences.slice(0, 3);
  // Fallback: non-heading lines
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && !l.startsWith("#"))
    .slice(0, 3);
}

function PipelineBanner({ idea }: { idea: Idea }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [searches, setSearches] = useState<SearchLine[]>([]);
  const [stageLines, setStageLines] = useState<{ label: string; done: boolean }[]>([]);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const accumText = useRef("");
  const logRef = useRef<HTMLDivElement>(null);

  const d = idea.development;
  const needsSharpening = idea.state === "triaged" && !d?.problem_statement;
  const needsArtifacts = !!d?.problem_statement && !d?.prd;

  if (!needsSharpening && !needsArtifacts) return null;

  async function runPipeline(endpoint: string, body: object) {
    setRunning(true);
    setSearches([]);
    setStageLines([]);
    setSummary(null);
    setErrorMsg(null);
    accumText.current = "";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "Unknown error");
        setErrorMsg(`Error: ${text}`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const isSharpen = endpoint === "/api/sharpen";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;

            if (evt.error) {
              setErrorMsg(`Error: ${evt.error}`);

            } else if (evt.type === "search") {
              // Add a new in-progress search line
              const query = (evt.query as string | null) ?? "web search";
              setSearches((s) => [...s, { query, done: false }]);

            } else if (evt.type === "search_done") {
              // Mark the last pending search as complete
              setSearches((s) => {
                const updated = [...s];
                const lastPending = updated.map((x) => !x.done).lastIndexOf(true);
                if (lastPending >= 0) updated[lastPending] = { ...updated[lastPending], done: true };
                return updated;
              });

            } else if (evt.text) {
              if (isSharpen) accumText.current += evt.text as string;

            } else if (evt.stage) {
              setStageLines((s) => [...s, { label: evt.label as string, done: false }]);

            } else if (evt.stage_done) {
              setStageLines((s) => {
                const updated = [...s];
                const last = updated.map((x) => !x.done).lastIndexOf(true);
                if (last >= 0) updated[last] = { ...updated[last], done: true };
                return updated;
              });

            } else if (evt.done) {
              if (isSharpen) {
                setSummary(extractSummaryBullets(accumText.current));
              }
              router.refresh();
              setTimeout(() => window.location.reload(), 400);
            }
          } catch {
            // ignore parse errors
          }
        }

        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }
    } catch (err) {
      setErrorMsg(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="mb-6 rounded-lg border p-4"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.04)",
      }}
    >
      {needsSharpening && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="mb-1 text-sm font-medium"
              style={{ color: "var(--studio-fg)" }}
            >
              Ready to sharpen
            </p>
            <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
              Run web research and produce the problem statement, core
              hypothesis, and personas.
            </p>
          </div>
          <button
            onClick={() => runPipeline("/api/sharpen", { idea_id: idea.id })}
            disabled={running}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--studio-amber)",
              color: "var(--studio-bg)",
            }}
          >
            {running ? "Running…" : "Run Sharpening"}
          </button>
        </div>
      )}

      {needsArtifacts && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="mb-1 text-sm font-medium"
              style={{ color: "var(--studio-fg)" }}
            >
              Ready for artifacts
            </p>
            <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
              Generate PRD, MVP scope, next steps, and builder brief.
            </p>
          </div>
          <button
            onClick={() => runPipeline("/api/artifacts", { idea_id: idea.id })}
            disabled={running}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--studio-amber)",
              color: "var(--studio-bg)",
            }}
          >
            {running ? "Running…" : "Run Artifacts"}
          </button>
        </div>
      )}

      {/* Progress / summary area */}
      {(searches.length > 0 || stageLines.length > 0 || summary || errorMsg) && (
        <div
          ref={logRef}
          className="mt-4 max-h-48 overflow-y-auto rounded border p-3"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-bg)",
          }}
        >
          {errorMsg && (
            <p className="text-[11px]" style={{ color: "#f87171" }}>{errorMsg}</p>
          )}

          {/* Search lines — visible while running; hidden once summary replaces them */}
          {!summary && searches.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] leading-relaxed font-mono"
              style={{ color: s.done ? "var(--studio-fg-muted)" : "var(--studio-amber-dim)" }}
            >
              <span className="shrink-0">{s.done ? "✓" : "🔍"}</span>
              <span className={s.done ? "" : "opacity-70"}>
                {s.done ? s.query : `Searching: ${s.query}`}
              </span>
            </div>
          ))}

          {/* Artifact stage lines */}
          {stageLines.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] leading-relaxed font-mono"
              style={{ color: s.done ? "var(--studio-fg-muted)" : "var(--studio-amber-dim)" }}
            >
              <span className="shrink-0">{s.done ? "✓" : "→"}</span>
              <span>{s.done ? s.label : `${s.label}…`}</span>
            </div>
          ))}

          {/* Post-sharpening summary bullets */}
          {summary && (
            <div className="space-y-1.5">
              {summary.map((bullet, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span
                    className="mt-1 h-1 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--studio-amber-dim)" }}
                  />
                  <span style={{ color: "var(--studio-fg-muted)" }}>{bullet}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function IdeaDetailShell({
  idea,
  journal,
  refinements,
  conversations,
  messages,
  activeTab,
}: {
  idea: Idea;
  journal: JournalEntry[];
  refinements: Refinement[];
  conversations: Conversation[];
  messages: Message[];
  activeTab: string;
}) {
  const name = ideaDisplayName(idea);
  const normalizedTab =
    activeTab === "portfolio" ? "workspace" : activeTab;
  const tab = (TABS.find((t) => t.id === normalizedTab)?.id ?? "overview") as Tab;
  const baseHref = `/studio/ideas/${idea.id}`;

  return (
    <div>
      {/* Back */}
      <Link
        href="/studio"
        className="mb-6 inline-flex items-center gap-1 text-xs transition-colors"
        style={{ color: "var(--studio-fg-muted)" }}
      >
        ← All ideas
      </Link>

      {/* Title + publish toggle */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1
          className="text-2xl font-normal leading-tight"
          style={{
            fontFamily: "var(--font-playfair, Georgia, serif)",
            color: "var(--studio-fg)",
          }}
        >
          {name}
        </h1>
        <PublishToggle idea={idea} />
      </div>

      <div className="grid min-h-0 gap-8 lg:grid-cols-[1fr_260px]">
        {/* Left: tabs + content */}
        <div className={tab === "workspace" ? "flex min-h-0 min-w-0 flex-col" : ""}>
          {/* Pipeline banner + re-triage button (overview tab only) */}
          {tab === "overview" && (
            <>
              <PipelineBanner idea={idea} />
              {idea.triage && (
                <div className="mb-6 flex justify-end">
                  <Link
                    href={`${baseHref}/retriage`}
                    className="rounded border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-fg-muted)",
                    }}
                  >
                    Re-triage this idea
                  </Link>
                </div>
              )}
            </>
          )}

          {/* Tab bar */}
          <div
            className="mb-6 flex gap-0 border-b"
            style={{ borderColor: "var(--studio-border)" }}
          >
            {TABS.filter((t) => !t.requiresDev || !!idea.development?.problem_statement).map((t) => (
              <Link
                key={t.id}
                href={`${baseHref}?tab=${t.id}`}
                className="border-b-2 px-4 py-2.5 text-xs font-medium transition-colors"
                style={{
                  borderColor:
                    tab === t.id ? "var(--studio-amber)" : "transparent",
                  color:
                    tab === t.id
                      ? "var(--studio-amber)"
                      : "var(--studio-fg-muted)",
                }}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Content */}
          {tab === "overview" && <OverviewTab idea={idea} />}
          {tab === "artifacts" && <ArtifactPanel idea={idea} />}
          {tab === "journal" && <JournalPanel entries={journal} />}
          {tab === "refinements" && (
            <RefinementsPanel refinements={refinements} />
          )}
          {tab === "conversations" && (
            <ConversationsPanel
              conversations={conversations}
              messages={messages}
              ideaId={idea.id}
            />
          )}
          {tab === "outcomes" && <OutcomesPanel idea={idea} />}
          {tab === "workspace" && <WorkspaceTab idea={idea} />}
        </div>

        {/* Right: sidebar */}
        <IdeaSidebar idea={idea} />
      </div>
    </div>
  );
}
