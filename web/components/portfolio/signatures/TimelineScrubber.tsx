"use client";

import { useState } from "react";

export interface TimelineScrubberProps {
  entries: { date: string; label: string; body: string }[];
}

export function TimelineScrubber({ entries }: TimelineScrubberProps) {
  const safeEntries = entries ?? [];
  const [active, setActive] = useState(0);
  const current = safeEntries[active];

  if (safeEntries.length === 0) return null;

  return (
    <div className="w-full">
      {/* Scrubber track */}
      <div className="relative mb-8 flex items-center">
        <div className="absolute h-px w-full" style={{ backgroundColor: "var(--border)" }} />
        <div className="relative flex w-full justify-between">
          {safeEntries.map((entry, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="relative flex flex-col items-center gap-2"
              aria-label={entry.label}
            >
              <span
                className="h-3 w-3 rounded-full border-2 transition-colors"
                style={{
                  borderColor: active === i ? "var(--accent)" : "var(--border)",
                  backgroundColor: active === i ? "var(--accent)" : "var(--bg)",
                }}
              />
              <span
                className="hidden text-[10px] font-mono md:block"
                style={{ color: active === i ? "var(--accent)" : "var(--muted)" }}
              >
                {entry.date}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected entry */}
      {current && (
        <div className="min-h-24">
          <p className="mb-1 font-serif text-xl" style={{ color: "var(--fg)" }}>
            {current.label}
          </p>
          <p className="mb-2 font-mono text-xs" style={{ color: "var(--accent)" }}>
            {current.date}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {current.body}
          </p>
        </div>
      )}
    </div>
  );
}
