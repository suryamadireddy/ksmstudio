"use client";

import type { AccentColor, LayoutTemplate, PresentationSection, PresentationSpec } from "@/lib/types";
import { SectionsList } from "./workspace-toolbar/SectionsList";

const TEMPLATES: { id: LayoutTemplate; label: string; hint: string }[] = [
  { id: "clean", label: "Clean", hint: "Linear narrative, minimal chrome" },
  { id: "showcase", label: "Showcase", hint: "Side signature rail, gallery-forward" },
  { id: "aesthetic", label: "Aesthetic", hint: "Hero-led, editorial rhythm" },
];

const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "deep_teal", label: "Deep teal", swatch: "#0f766e" },
  { id: "ember_red", label: "Ember", swatch: "#b91c1c" },
  { id: "sage", label: "Sage", swatch: "#4d7c6e" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "terracotta", label: "Terracotta", swatch: "#c2410c" },
];

export function WorkspaceToolbar({
  presentation,
  placementModeActive,
  onTemplateChange,
  onAccentChange,
  onSectionsChange,
  onBeginSignaturePlacement,
  onResetSignaturePlacement,
}: {
  presentation: PresentationSpec;
  placementModeActive: boolean;
  onTemplateChange: (t: LayoutTemplate) => void;
  onAccentChange: (a: AccentColor) => void;
  onSectionsChange: (sections: PresentationSection[]) => void;
  onBeginSignaturePlacement: () => void;
  onResetSignaturePlacement: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-5 rounded-lg border p-4"
      style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
    >
      <section className="space-y-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--studio-amber-dim)" }}
        >
          Template
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => {
            const active = presentation.layout_template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                onClick={() => onTemplateChange(t.id)}
                className="rounded border px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? "var(--studio-amber)" : "var(--studio-border)",
                  color: active ? "var(--studio-amber)" : "var(--studio-fg)",
                  backgroundColor: active ? "rgba(217,119,6,0.08)" : "transparent",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--studio-amber-dim)" }}
        >
          Accent
        </p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => {
            const active = presentation.accent_color === a.id;
            return (
              <button
                key={a.id}
                type="button"
                title={a.label}
                aria-label={a.label}
                onClick={() => onAccentChange(a.id)}
                className="h-8 w-8 rounded-full border-2 transition-transform"
                style={{
                  borderColor: active ? "var(--studio-amber)" : "var(--studio-border)",
                  backgroundColor: a.swatch,
                  transform: active ? "scale(1.08)" : undefined,
                }}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--studio-amber-dim)" }}
        >
          Sections
        </p>
        <SectionsList sections={presentation.sections} onChange={onSectionsChange} />
      </section>

      <section className="space-y-2 border-t pt-4" style={{ borderColor: "var(--studio-border)" }}>
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--studio-amber-dim)" }}
        >
          Signature
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onBeginSignaturePlacement}
            disabled={placementModeActive}
            className="rounded border px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--studio-border)",
              color: "var(--studio-fg)",
            }}
          >
            {placementModeActive ? "Placement mode active…" : "Place signature…"}
          </button>
          <button
            type="button"
            onClick={onResetSignaturePlacement}
            className="rounded px-3 py-1.5 text-left text-xs transition-colors"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            Reset to template default
          </button>
        </div>
      </section>
    </div>
  );
}
