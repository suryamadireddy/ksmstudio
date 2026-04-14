"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ideaDisplayName, type Idea, type JournalEntry, type Refinement, type Conversation, type Message } from "@/lib/types";
import IdeaSidebar from "./IdeaSidebar";
import ArtifactPanel from "./ArtifactPanel";
import JournalPanel from "./JournalPanel";
import RefinementsPanel from "./RefinementsPanel";
import ConversationsPanel from "./ConversationsPanel";

type Tab = "overview" | "artifacts" | "journal" | "refinements" | "conversations";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "artifacts", label: "Artifacts" },
  { id: "journal", label: "Journal" },
  { id: "refinements", label: "Refinements" },
  { id: "conversations", label: "Conversations" },
];

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>
      {children}
    </p>
  );
}

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

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <Prose>None listed.</Prose>;
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

function OverviewTab({ idea }: { idea: Idea }) {
  const t = idea.triage;
  const d = idea.development;
  return (
    <div>
      <Section title="Original Idea">
        <Prose>{idea.raw_input}</Prose>
      </Section>
      {t?.triage_reasoning && (
        <Section title="Triage Reasoning">
          <Prose>{t.triage_reasoning}</Prose>
        </Section>
      )}
      {t?.who_benefits && (
        <Section title="Who Benefits">
          <Prose>{t.who_benefits}</Prose>
        </Section>
      )}
      {t?.kill_assumptions && t.kill_assumptions.length > 0 && (
        <Section title="Kill Assumptions">
          <BulletList items={t.kill_assumptions} />
        </Section>
      )}
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
  const tab = (TABS.find((t) => t.id === activeTab)?.id ?? "overview") as Tab;
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

      {/* Title */}
      <h1
        className="mb-6 text-2xl font-normal leading-tight"
        style={{
          fontFamily: "var(--font-playfair, Georgia, serif)",
          color: "var(--studio-fg)",
        }}
      >
        {name}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        {/* Left: tabs + content */}
        <div>
          {/* Tab bar */}
          <div
            className="mb-6 flex gap-0 border-b"
            style={{ borderColor: "var(--studio-border)" }}
          >
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={`${baseHref}?tab=${t.id}`}
                className="border-b-2 px-4 py-2.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: tab === t.id ? "var(--studio-amber)" : "transparent",
                  color: tab === t.id ? "var(--studio-amber)" : "var(--studio-fg-muted)",
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
          {tab === "refinements" && <RefinementsPanel refinements={refinements} />}
          {tab === "conversations" && (
            <ConversationsPanel conversations={conversations} messages={messages} />
          )}
        </div>

        {/* Right: sidebar */}
        <IdeaSidebar idea={idea} />
      </div>
    </div>
  );
}
