"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortfolioGeneratePanel({
  ideaId,
  onDistillSuccess,
}: {
  ideaId: string;
  /** Called after a successful distill stream completes and the page is refreshed. */
  onDistillSuccess?: () => void;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [fullRegen, setFullRegen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressLines, setProgressLines] = useState<string[]>([]);

  async function handleGenerate() {
    setGenerating(true);
    setProgressLines([]);
    const lines: string[] = [];
    try {
      const res = await fetch(`/api/studio/ideas/${ideaId}/distill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief || undefined,
          mode: fullRegen ? "full_regen" : "default",
        }),
      });
      if (!res.ok || !res.body) {
        setProgressLines(["[error] Distillation failed"]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        lines.push(...chunk.split("\n").filter((l) => l.trim()));
        setProgressLines([...lines]);
      }
      router.refresh();
      if (!lines.some((l) => l.trimStart().startsWith("[error]"))) {
        onDistillSuccess?.();
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--studio-border)" }}
    >
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber-dim)" }}
      >
        Generate
      </p>
      <div className="mb-3">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Creative brief (optional) — focus, tone, angle..."
          rows={3}
          className="w-full resize-none rounded border px-3 py-2 text-sm focus:outline-none"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-bg)",
            color: "var(--studio-fg)",
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <label
          className="flex cursor-pointer items-center gap-2 text-xs"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          <input
            type="checkbox"
            checked={fullRegen}
            onChange={(e) => setFullRegen(e.target.checked)}
            className="rounded"
          />
          Full regeneration (all 3 passes)
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          style={{
            backgroundColor: "var(--studio-amber)",
            color: "var(--studio-bg)",
          }}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>
      {progressLines.length > 0 && (
        <div
          className="mt-4 max-h-40 overflow-y-auto rounded border p-3 font-mono"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          {progressLines.map((line, i) => (
            <p
              key={i}
              className="text-[11px] leading-relaxed"
              style={{
                color: line.startsWith("[error]")
                  ? "#f87171"
                  : "var(--studio-fg-muted)",
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
