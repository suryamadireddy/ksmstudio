"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveTheme, type Theme } from "@/lib/theme";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("ksm-theme-override") as
      | "light"
      | "dark"
      | null;
    setTheme(resolveTheme(stored));
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    localStorage.setItem("ksm-theme-override", next);
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-7 w-7 items-center justify-center rounded text-sm transition-opacity hover:opacity-70"
      style={{ color: "var(--fg, #1a1a1a)" }}
    >
      {theme === "light" ? "☽" : "○"}
    </button>
  );
}

export function Header() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg, #fafaf8) 96%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="h-[72px] px-8 md:px-10">
        <div className="flex h-full items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium tracking-tight"
            style={{ color: "var(--fg, #1a1a1a)" }}
          >
            KSM Studio
          </Link>

          <div className="flex h-full items-center gap-8">
            <Link
              href="/projects"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--muted, #6b6b6b)" }}
            >
              Projects
            </Link>
            <Link
              href="/process"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--muted, #6b6b6b)" }}
            >
              Process
            </Link>
            <Link
              href="/#about"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--muted, #6b6b6b)" }}
            >
              About
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
