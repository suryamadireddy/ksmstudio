"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import type { PresentationSection } from "@/lib/types";

const LABEL: Record<string, string> = {
  statement: "Statement",
  prose_block: "Prose block",
  quote_wall: "Quote wall",
  timeline: "Timeline",
  data_panel: "Data panel",
  image_feature: "Image feature",
  list_inventory: "List inventory",
  side_by_side: "Side by side",
  artifact_explorer: "Artifact explorer",
  signature_slot: "Signature",
  conversation_invitation: "Conversation invitation",
};

function sectionLabel(s: PresentationSection) {
  return LABEL[s.archetype] ?? s.archetype.replace(/_/g, " ");
}

function purposeSummary(s: PresentationSection) {
  if (!s.purpose?.length) return null;
  return s.purpose.join(" · ");
}

/**
 * Toolbar list: reorder via index permutation only (Framer never holds PresentationSection objects).
 * Full section data always comes from the parent `sections` prop.
 */
export function SectionsList({
  sections,
  onChange,
}: {
  sections: PresentationSection[];
  onChange: (next: PresentationSection[]) => void;
}) {
  const sectionsKey = useMemo(() => JSON.stringify(sections), [sections]);
  const [order, setOrder] = useState<number[]>(() => sections.map((_, i) => i));
  const orderRef = useRef(order);
  const sectionsRef = useRef(sections);
  orderRef.current = order;
  sectionsRef.current = sections;

  useEffect(() => {
    setOrder(sections.map((_, i) => i));
  }, [sectionsKey, sections]);

  const flushReorder = useCallback(() => {
    const ord = orderRef.current;
    const src = sectionsRef.current;
    onChange(ord.map((i) => src[i]));
  }, [onChange]);

  return (
    <div className="relative max-h-[400px] overflow-y-auto overflow-x-hidden">
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={(nextOrder) => {
          setOrder(nextOrder);
        }}
        className="relative flex flex-col gap-1.5"
      >
          {order.map((sectionIndex) => {
            const section = sections[sectionIndex];
            if (!section) return null;
            const sig = section.archetype === "signature_slot";
            const purpose = purposeSummary(section);
            const stableKey = [
              sectionIndex,
              section.archetype,
              section.weight,
              section.purpose?.join(":") ?? "",
              section.content_brief ?? "",
            ].join("::");
            return (
              <Reorder.Item
                key={stableKey}
                value={sectionIndex}
                as="div"
                dragElastic={0.1}
                layout="position"
                onDragEnd={flushReorder}
                className="flex cursor-grab items-stretch gap-2 rounded border px-2 py-2 active:cursor-grabbing"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-bg-2)",
                }}
              >
                <div
                  className="flex shrink-0 items-center self-stretch border-r pr-2"
                  style={{ borderColor: "var(--studio-border)" }}
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4 shrink-0" style={{ color: "var(--studio-fg-muted)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-medium" style={{ color: "var(--studio-fg)" }}>
                      {sectionLabel(section)}
                    </span>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        color: "var(--studio-fg-muted)",
                        border: "1px solid var(--studio-border)",
                      }}
                    >
                      {section.weight}
                    </span>
                    {sig ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--studio-amber-dim)" }}>
                        layout via Signature
                      </span>
                    ) : null}
                  </div>
                  {purpose ? (
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--studio-fg-muted)" }}>
                      {purpose}
                    </p>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug" style={{ color: "var(--studio-fg-muted)" }}>
                    {section.content_brief || "—"}
                  </p>
                  {section.notes ? (
                    <p className="mt-0.5 line-clamp-1 text-[10px] italic" style={{ color: "var(--studio-fg-muted)" }}>
                      Notes: {section.notes}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={sig}
                  title={
                    sig
                      ? "Signature cannot be hidden — use placement mode in the preview"
                      : section.hidden
                        ? "Show section in portfolio"
                        : "Hide section in portfolio"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sig) return;
                    const src = sectionsRef.current;
                    const next = src.map((s, i) => (i === sectionIndex ? { ...s, hidden: !s.hidden } : s));
                    onChange(next);
                  }}
                  className="flex shrink-0 items-center self-center rounded p-1.5 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                  style={{ color: "var(--studio-fg-muted)" }}
                >
                  {section.hidden ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                </button>
              </Reorder.Item>
            );
          })}
      </Reorder.Group>
    </div>
  );
}
