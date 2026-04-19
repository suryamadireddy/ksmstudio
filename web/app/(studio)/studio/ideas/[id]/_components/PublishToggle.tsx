"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea } from "@/lib/types";

export default function PublishToggle({ idea }: { idea: Idea }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"publish" | "unpublish" | null>(null);
  const [headline, setHeadline] = useState(
    idea.portfolio?.headline ??
    (idea.triage?.triage_reasoning?.split(/[.!?]/)[0]?.trim() ?? "")
  );
  const [loading, setLoading] = useState(false);

  const isPublished = idea.published ?? false;
  const hasNick = !!idea.triage;

  async function doPublish() {
    setLoading(true);
    await fetch(`/api/ideas/${idea.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", headline }),
    });
    setLoading(false);
    setDialog(null);
    router.refresh();
  }

  async function doUnpublish() {
    setLoading(true);
    await fetch(`/api/ideas/${idea.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });
    setLoading(false);
    setDialog(null);
    router.refresh();
  }

  const slug = idea.portfolio?.slug;

  return (
    <>
      <div>
        {isPublished ? (
          <div>
            <button
              onClick={() => setDialog("unpublish")}
              className="flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: "rgba(74,222,128,0.4)", color: "#4ade80", backgroundColor: "rgba(74,222,128,0.06)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Published
            </button>
            {slug && (
              <a
                href={`/p/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-[11px] transition-colors"
                style={{ color: "var(--studio-fg-muted)" }}
              >
                View public page →
              </a>
            )}
          </div>
        ) : (
          <button
            onClick={() => hasNick ? setDialog("publish") : undefined}
            disabled={!hasNick}
            title={!hasNick ? "Triage this idea before publishing." : undefined}
            className="rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
          >
            Publish to portfolio
          </button>
        )}
      </div>

      {/* Publish dialog */}
      {dialog === "publish" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="mx-4 w-full max-w-md rounded-lg p-6"
            style={{ backgroundColor: "var(--studio-bg)", borderColor: "var(--studio-border)", border: "1px solid" }}
          >
            <h3 className="mb-4 text-base font-medium" style={{ color: "var(--studio-fg)" }}>
              Publish to portfolio
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
              This will make the idea visible on your public portfolio.
            </p>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--studio-amber-dim)" }}>
              Headline
            </label>
            <textarea
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              rows={2}
              placeholder="One sentence describing this idea publicly"
              className="mb-3 w-full rounded border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)", color: "var(--studio-fg)" }}
            />

            {idea.portfolio?.slug && (
              <p className="mb-4 text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
                URL: <span className="font-mono">/p/{idea.portfolio.slug}</span>
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={doPublish}
                disabled={loading || !headline.trim()}
                className="rounded px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
              >
                {loading ? "Publishing…" : "Publish"}
              </button>
              <button
                onClick={() => setDialog(null)}
                className="rounded px-4 py-1.5 text-xs transition-colors"
                style={{ color: "var(--studio-fg-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpublish dialog */}
      {dialog === "unpublish" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg p-6"
            style={{ backgroundColor: "var(--studio-bg)", borderColor: "var(--studio-border)", border: "1px solid" }}
          >
            <h3 className="mb-3 text-base font-medium" style={{ color: "var(--studio-fg)" }}>
              Unpublish this idea?
            </h3>
            <p className="mb-5 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
              It will no longer appear on your public portfolio.
            </p>
            <div className="flex gap-2">
              <button
                onClick={doUnpublish}
                disabled={loading}
                className="rounded px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                style={{ backgroundColor: "#f87171", color: "#fff" }}
              >
                {loading ? "Unpublishing…" : "Unpublish"}
              </button>
              <button
                onClick={() => setDialog(null)}
                className="rounded px-4 py-1.5 text-xs transition-colors"
                style={{ color: "var(--studio-fg-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
