export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  ideaDisplayName,
  type Idea,
  type JournalEntry,
  type Message,
  type Conversation,
} from "@/lib/types";

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getIdea(id: string): Promise<Idea | null> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("ideas")
    .select("id, raw_input, domain, state, created_at, triage, development")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as Idea;
}

async function getJournalEntries(ideaId: string): Promise<JournalEntry[]> {
  const supabase = serverSupabase();
  const { data } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return (data ?? []) as JournalEntry[];
}

async function getConversations(ideaId: string): Promise<Conversation[]> {
  const supabase = serverSupabase();
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Conversation[];
}

async function getMessages(ideaId: string): Promise<Message[]> {
  const supabase = serverSupabase();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Message[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  return `${Math.floor(diff / d)}d ago`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DISPOSITION_STYLES: Record<string, string> = {
  pursue: "bg-green-100 text-green-800 border-green-200",
  park: "bg-amber-100 text-amber-800 border-amber-200",
  discard: "bg-gray-100 text-gray-700 border-gray-200",
  kill: "bg-red-100 text-red-700 border-red-200",
};

const CATEGORY_LABELS: Record<number, string> = {
  1: "High signal",
  2: "Needs sharpening",
  3: "Speculative",
  4: "Weak signal",
};

// ── Sub-sections ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-gray-700">{children}</p>;
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-gray-400 italic">None listed.</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ScoreBadge({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gray-800"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-700">{value}/{max}</span>
      </div>
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({ idea }: { idea: Idea }) {
  const t = idea.triage;
  const d = idea.development;

  return (
    <div className="space-y-0">
      {/* Raw idea */}
      <Section title="Original Idea">
        <Prose>{idea.raw_input}</Prose>
      </Section>

      {/* Triage */}
      {t && (
        <>
          <Section title="Triage Scores">
            <div className="flex flex-wrap gap-6">
              <ScoreBadge label="Impact" value={t.impact_score} />
              <ScoreBadge label="Effort" value={t.effort_score} />
              <ScoreBadge label="Confidence" value={t.confidence} />
            </div>
          </Section>

          <Section title="Triage Reasoning">
            <Prose>{t.triage_reasoning}</Prose>
          </Section>

          <Section title="Who Benefits">
            <Prose>{t.who_benefits}</Prose>
          </Section>

          {t.kill_assumptions?.length > 0 && (
            <Section title="Kill Assumptions">
              <BulletList items={t.kill_assumptions.map((a) =>
                typeof a === "object" ? a.text : a
              )} />
            </Section>
          )}
        </>
      )}

      {/* Development */}
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
      {d?.competitive_landscape && (
        <Section title="Competitive Landscape">
          <Prose>{d.competitive_landscape}</Prose>
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

// ── Tab: Artifacts ─────────────────────────────────────────────────────────────

function ArtifactsTab({ idea }: { idea: Idea }) {
  const d = idea.development;
  const prd = d?.prd;
  const mvp = d?.mvp_scope;
  const next = d?.next_steps;
  const personas = d?.personas ?? [];

  if (!prd && !mvp && !next && !personas.length) {
    return (
      <p className="mt-4 text-sm text-gray-400 italic">
        No artifacts generated yet. Run the development pipeline to generate PRD, personas, and MVP scope.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {/* Personas */}
      {personas.length > 0 && (
        <Section title={`Personas (${personas.length})`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {personas.map((p, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="mb-1 text-sm font-semibold text-gray-900">{p.label}</p>
                <p className="mb-2 text-xs text-gray-500">{p.description}</p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600"><span className="font-medium">Pain:</span> {p.pain}</p>
                  <p className="text-xs text-gray-600"><span className="font-medium">Gain:</span> {p.gain}</p>
                </div>
                {p.proxy_for_real_user && (
                  <span className="mt-2 inline-block rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    Proxy for real user
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* PRD */}
      {prd && (
        <Section title="PRD">
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            {prd.problem && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Problem</p>
                <Prose>{prd.problem}</Prose>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Solution</p>
              <Prose>{prd.solution}</Prose>
            </div>
            {prd.user_stories?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">User Stories</p>
                <BulletList items={prd.user_stories} />
              </div>
            )}
            {prd.success_metrics?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Success Metrics</p>
                <BulletList items={prd.success_metrics} />
              </div>
            )}
            {prd.out_of_scope?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Out of Scope</p>
                <BulletList items={prd.out_of_scope} />
              </div>
            )}
            {prd.red_flags && prd.red_flags.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Red Flags</p>
                <BulletList items={prd.red_flags} />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* MVP Scope */}
      {mvp && (
        <Section title="MVP Scope">
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            {mvp.effort_estimate && (
              <p className="text-xs text-gray-500">
                <span className="font-medium">Effort estimate:</span> {mvp.effort_estimate}
              </p>
            )}
            {mvp.features && mvp.features.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Features</p>
                <div className="space-y-2">
                  {mvp.features.map((f, i) => (
                    <div key={i} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{f.name}</p>
                        {f.description && <p className="text-xs text-gray-500">{f.description}</p>}
                      </div>
                      {f.priority && (
                        <span className="shrink-0 rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 uppercase">
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Build Sequence</p>
                <ol className="space-y-1">
                  {mvp.build_sequence.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="shrink-0 font-mono text-xs text-gray-400">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Next Steps */}
      {next && (
        <Section title="Next Steps">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-medium text-gray-900">
              First action: <span className="font-normal text-gray-700">{next.first_action}</span>
            </p>
            {next.critical_path && (
              <p className="mb-3 text-sm text-gray-600">
                <span className="font-medium">Critical path:</span> {next.critical_path}
              </p>
            )}
            {next.resolution_actions && next.resolution_actions.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Resolution Actions</p>
                <div className="space-y-2">
                  {next.resolution_actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        {a.type}
                      </span>
                      <p className="text-sm text-gray-700">{a.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Tab: Conversation ──────────────────────────────────────────────────────────

function ConversationTab({
  messages,
  conversations,
}: {
  messages: Message[];
  conversations: Conversation[];
}) {
  if (!messages.length) {
    return (
      <p className="mt-4 text-sm text-gray-400 italic">
        No conversation history yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {conversations.map((c) => (
            <span key={c.id} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500">
              {c.context ?? "Session"} · {relativeTime(c.created_at)}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isIdea = msg.role === "idea";
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={[
                  "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  isUser
                    ? "bg-gray-900 text-white"
                    : isIdea
                    ? "border border-gray-200 bg-white text-gray-800"
                    : "bg-gray-100 text-gray-800",
                ].join(" ")}
              >
                {!isUser && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {isIdea ? "Idea" : "Assistant"}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="mt-1.5 text-[10px] opacity-50">{relativeTime(msg.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Journal ───────────────────────────────────────────────────────────────

function JournalTab({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) {
    return (
      <p className="mt-4 text-sm text-gray-400 italic">
        No journal entries yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
              {entry.type}
            </span>
            {entry.promoted_to && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                → {entry.promoted_to}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">{formatDate(entry.created_at)}</span>
          </div>
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{entry.content}</p>
        </div>
      ))}
    </div>
  );
}

// ── Tabs shell ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "artifacts" | "conversation" | "journal";

function TabBar({ active, ideaId, counts }: { active: Tab; ideaId: string; counts: Record<string, number> }) {
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "artifacts", label: "Artifacts" },
    { id: "conversation", label: "Conversation", count: counts.messages },
    { id: "journal", label: "Journal", count: counts.journal },
  ];

  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/ideas/${ideaId}?tab=${tab.id}`}
          className={[
            "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            active === tab.id
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700",
          ].join(" ")}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function IdeaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab: Tab =
    tabParam === "artifacts" || tabParam === "conversation" || tabParam === "journal"
      ? tabParam
      : "overview";

  const [idea, journalEntries, conversations, messages] = await Promise.all([
    getIdea(id),
    getJournalEntries(id),
    getConversations(id),
    getMessages(id),
  ]);

  if (!idea) notFound();

  const name = ideaDisplayName(idea);
  const t = idea.triage;
  const disposition = t?.disposition;
  const dispStyle = disposition ? DISPOSITION_STYLES[disposition] : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Back */}
        <Link
          href="/ideas"
          className="mb-6 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          ← All ideas
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {disposition && (
              <span className={`rounded border px-2.5 py-0.5 text-xs font-semibold capitalize ${dispStyle}`}>
                {disposition}
              </span>
            )}
            {t?.category && (
              <span className="rounded border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                Cat {t.category} · {CATEGORY_LABELS[t.category]}
              </span>
            )}
            {idea.state && (
              <span className="rounded border border-gray-200 px-2.5 py-0.5 font-mono text-xs text-gray-500">
                {idea.state}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">{relativeTime(idea.created_at)}</span>
          </div>

          <h1 className="text-2xl font-bold leading-tight text-gray-900">{name}</h1>

          {t && (
            <div className="mt-3 flex flex-wrap gap-4">
              <ScoreBadge label="Impact" value={t.impact_score} />
              <ScoreBadge label="Effort" value={t.effort_score} />
              <ScoreBadge label="Confidence" value={t.confidence} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <TabBar
            active={activeTab}
            ideaId={id}
            counts={{ messages: messages.length, journal: journalEntries.length }}
          />
          <div className="p-6">
            {activeTab === "overview" && <OverviewTab idea={idea} />}
            {activeTab === "artifacts" && <ArtifactsTab idea={idea} />}
            {activeTab === "conversation" && (
              <ConversationTab messages={messages} conversations={conversations} />
            )}
            {activeTab === "journal" && <JournalTab entries={journalEntries} />}
          </div>
        </div>
      </div>
    </div>
  );
}
