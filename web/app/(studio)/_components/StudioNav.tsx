"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function StudioNav({ user }: { user: User }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <nav
      className="border-b px-6 py-4"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "var(--studio-bg)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link
          href="/studio"
          className="flex items-center gap-3 transition-opacity hover:opacity-70"
        >
          <span
            className="text-lg font-normal tracking-tight"
            style={{
              fontFamily: "var(--font-playfair, Georgia, serif)",
              color: "var(--studio-fg)",
            }}
          >
            KSM Studio
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest"
            style={{
              backgroundColor: "var(--studio-amber)",
              color: "var(--studio-bg)",
            }}
          >
            Studio
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <span
            className="hidden text-xs sm:block"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            {user.email}
          </span>
          <button
            onClick={signOut}
            className="studio-nav-signout text-xs transition-colors"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
