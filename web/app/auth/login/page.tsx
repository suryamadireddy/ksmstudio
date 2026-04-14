"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  async function signInWithGitHub() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0e0c]">
      <div className="w-full max-w-sm px-6">
        <div className="mb-10">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[#6b6560]">
            KSM Studio
          </p>
          <h1
            className="text-3xl font-normal text-[#e8e3d8]"
            style={{ fontFamily: "var(--font-playfair, Georgia, serif)" }}
          >
            Sign in
          </h1>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            Authentication failed. Please try again.
          </div>
        )}

        <button
          onClick={signInWithGitHub}
          className="flex w-full items-center justify-center gap-3 rounded border border-[#2a2926] bg-[#1a1916] px-4 py-3 text-sm font-medium text-[#e8e3d8] transition-colors hover:bg-[#222018] hover:border-[#d4a853]/40"
        >
          <svg
            className="h-4 w-4"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          Continue with GitHub
        </button>

        <p className="mt-6 text-center text-xs text-[#6b6560]">
          Access is restricted to the studio owner.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
