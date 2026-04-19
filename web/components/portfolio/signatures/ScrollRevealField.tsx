"use client";

import { useEffect, useRef, useState } from "react";

export interface ScrollRevealFieldProps {
  items?: { label: string; body: string }[];
  direction?: "horizontal" | "vertical";
}

export function ScrollRevealField({ items, direction = "horizontal" }: ScrollRevealFieldProps) {
  const safeItems = items ?? [];
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [visible, setVisible] = useState<boolean[]>(() => safeItems.map(() => false));

  useEffect(() => {
    const observers = refs.current.map((el, i) => {
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
            obs.disconnect();
          }
        },
        { threshold: 0.15 },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  if (safeItems.length === 0) return null;

  return (
    <div
      className={
        direction === "horizontal"
          ? "flex flex-wrap gap-6"
          : "flex flex-col gap-6"
      }
    >
      {safeItems.map((item, i) => (
        <div
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="transition-all duration-700"
          style={{
            opacity: visible[i] ? 1 : 0,
            transform: visible[i]
              ? "translateX(0)"
              : direction === "horizontal"
              ? "translateX(-24px)"
              : "translateY(16px)",
          }}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            {item.label}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {item.body}
          </p>
        </div>
      ))}
    </div>
  );
}
