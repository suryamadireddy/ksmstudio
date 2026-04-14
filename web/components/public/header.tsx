"use client";

import Link from "next/link";

export function Header() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="h-[72px] px-8 md:px-10">
        <div className="flex h-full items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium tracking-tight text-neutral-900"
          >
            KSM Studio
          </Link>

          <div className="flex h-full items-center gap-8">
            <Link
              href="/projects"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              Projects
            </Link>
            <Link
              href="/process"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              Process
            </Link>
            <Link
              href="/#about"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              About
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
