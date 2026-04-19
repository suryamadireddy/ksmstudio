"use client";

import { useState } from "react";

export interface ArtifactExplorerContent {
  preselected: "brief" | "synthesis" | "prd";
  intro: string;
}

const TABS = [
  { id: "brief", label: "Problem" },
  { id: "synthesis", label: "Research" },
  { id: "prd", label: "PRD" },
] as const;

type Tab = "brief" | "synthesis" | "prd";

export function ArtifactExplorer({ preselected, intro }: ArtifactExplorerContent) {
  const [active, setActive] = useState<Tab>(preselected);

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        {intro && (
          <p className="mb-8 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            {intro}
          </p>
        )}
        <div className="flex gap-1 border-b mb-8" style={{ borderColor: "var(--border)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="px-4 py-2.5 text-sm border-b-2 transition-colors"
              style={{
                borderColor: active === tab.id ? "var(--accent)" : "transparent",
                color: active === tab.id ? "var(--accent)" : "var(--muted)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="rounded-sm border px-8 py-10 text-sm leading-relaxed"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <p className="italic">
            {/* Actual artifact content is fetched and rendered by the page — this stub shows the selected tab */}
            Artifact content for &ldquo;{active}&rdquo; will render here.
          </p>
        </div>
      </div>
    </section>
  );
}
