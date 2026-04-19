"use client";

import { useState } from "react";

export interface HoverInventoryProps {
  items: { label: string; preview: string; detail: string }[];
}

export function HoverInventory({ items }: HoverInventoryProps) {
  const safeItems = items ?? [];
  const [hovered, setHovered] = useState<number | null>(null);

  if (safeItems.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-px md:grid-cols-3" style={{ backgroundColor: "var(--border)" }}>
      {safeItems.map((item, i) => (
        <div
          key={i}
          className="relative cursor-default px-6 py-8 transition-colors"
          style={{ backgroundColor: hovered === i ? "var(--surface)" : "var(--bg)" }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          <p className="mb-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
            {item.label}
          </p>
          <p
            className="text-xs leading-relaxed transition-opacity duration-200"
            style={{
              color: "var(--muted)",
              opacity: hovered === i ? 0 : 1,
              position: hovered === i ? "absolute" : "relative",
            }}
          >
            {item.preview}
          </p>
          {hovered === i && (
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              {item.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
