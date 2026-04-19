"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea, PortfolioVersion } from "@/lib/types";
import { PortfolioRender } from "@/components/portfolio/PortfolioRender";

export function PortfolioTab({ idea }: { idea: Idea }) {
  const router = useRouter();
  const portfolio = idea.portfolio;
  const versions: PortfolioVersion[] = portfolio?.versions ?? [];
  const activeVersionId = portfolio?.active_version_id ?? null;

  const [brief, setBrief] = useState("");
  const [fullRegen, setFullRegen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    activeVersionId ?? versions[0]?.id ?? null,
  );

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? null;

  async function handleGenerate() {
    setGenerating(true);
    setProgressLines([]);
    const lines: string[] = [];
    try {
      const res = await fetch(`/api/studio/ideas/${idea.id}/distill`, {
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
    } finally {
      setGenerating(false);
    }
  }

  async function handleActivate(versionId: string) {
    await fetch(
      `/api/studio/ideas/${idea.id}/portfolio/versions/${versionId}/activate`,
      { method: "POST" },
    );
    router.refresh();
  }

  async function handleArchive(versionId: string) {
    await fetch(
      `/api/studio/ideas/${idea.id}/portfolio/versions/${versionId}/archive`,
      { method: "POST" },
    );
    router.refresh();
  }

  async function handleBranch(versionId: string) {
    const res = await fetch(
      `/api/studio/ideas/${idea.id}/portfolio/versions/${versionId}/branch`,
      { method: "POST" },
    );
    const data = await res.json();
    router.refresh();
    if (data.version_id) setSelectedVersionId(data.version_id);
  }

  return (
    <div className="space-y-6">
      {/* Zone A: Generate */}
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

      {versions.length === 0 && !generating && (
        <div
          className="py-8 text-center text-sm"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          No portfolio versions yet. Generate the first one above.
        </div>
      )}

      {versions.length > 0 && (
        <>
          {/* Zone B: Preview */}
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--studio-border)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--studio-border)" }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                Preview
                {selectedVersion && (
                  <span style={{ color: "var(--studio-fg-muted)" }}>
                    {" "}
                    · v{versions.indexOf(selectedVersion) + 1}
                  </span>
                )}
                {selectedVersion?.status === "active" && (
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: "rgba(74,222,128,0.15)",
                      color: "#4ade80",
                    }}
                  >
                    active
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                {/* Theme toggle */}
                <div
                  className="flex overflow-hidden rounded border"
                  style={{ borderColor: "var(--studio-border)" }}
                >
                  {(["light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPreviewTheme(t)}
                      className="px-2.5 py-1 text-[11px] transition-colors"
                      style={{
                        backgroundColor:
                          previewTheme === t
                            ? "var(--studio-amber)"
                            : "transparent",
                        color:
                          previewTheme === t
                            ? "var(--studio-bg)"
                            : "var(--studio-fg-muted)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {/* Action bar */}
                {selectedVersion &&
                  selectedVersion.status !== "active" && (
                    <button
                      onClick={() => handleActivate(selectedVersion.id)}
                      className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor: "rgba(74,222,128,0.15)",
                        color: "#4ade80",
                      }}
                    >
                      Approve
                    </button>
                  )}
                {selectedVersion && selectedVersion.status !== "archived" && (
                  <button
                    onClick={() => handleArchive(selectedVersion.id)}
                    className="rounded px-2.5 py-1 text-[11px] transition-colors"
                    style={{ color: "var(--studio-fg-muted)" }}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>

            {/* Voice samples */}
            {selectedVersion &&
              (selectedVersion.voice?.sample_lines?.length ?? 0) > 0 && (
                <div
                  className="border-b px-4 py-3"
                  style={{
                    borderColor: "var(--studio-border)",
                    backgroundColor:
                      "rgba(var(--studio-amber-rgb,180,120,40),0.04)",
                  }}
                >
                  <p
                    className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--studio-amber-dim)" }}
                  >
                    How it sounds
                  </p>
                  <div className="space-y-1">
                    {selectedVersion.voice.sample_lines.map((line, i) => (
                      <p
                        key={i}
                        className="text-xs italic"
                        style={{ color: "var(--studio-fg-muted)" }}
                      >
                        &ldquo;{line}&rdquo;
                      </p>
                    ))}
                  </div>
                </div>
              )}

            {/* PortfolioRender preview */}
            {selectedVersion && (
              <div
                data-theme={previewTheme}
                data-accent={selectedVersion.presentation.accent_color}
                style={{ maxHeight: "70vh", overflowY: "auto" }}
              >
                <PortfolioRender version={selectedVersion} />
              </div>
            )}
          </div>

          {/* Zone C: Version history */}
          <div
            className="rounded-lg border"
            style={{ borderColor: "var(--studio-border)" }}
          >
            <div
              className="border-b px-4 py-3"
              style={{ borderColor: "var(--studio-border)" }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                Version History
              </p>
            </div>
            <div>
              {[...versions].reverse().map((v, i) => {
                const isSelected = v.id === selectedVersionId;
                const isActive = v.id === activeVersionId;
                return (
                  <div
                    key={v.id}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
                    style={{
                      borderColor: "var(--studio-border)",
                      backgroundColor: isSelected
                        ? "rgba(var(--studio-amber-rgb,180,120,40),0.06)"
                        : undefined,
                    }}
                    onClick={() => setSelectedVersionId(v.id)}
                  >
                    <div className="min-w-0">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--studio-fg)" }}
                        >
                          v{versions.length - i}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--studio-fg-muted)" }}
                        >
                          {new Date(v.created_at).toLocaleDateString()}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium capitalize"
                          style={{
                            backgroundColor: isActive
                              ? "rgba(74,222,128,0.12)"
                              : v.status === "draft"
                                ? "rgba(var(--studio-amber-rgb,180,120,40),0.12)"
                                : "rgba(107,114,128,0.12)",
                            color: isActive
                              ? "#4ade80"
                              : v.status === "draft"
                                ? "var(--studio-amber)"
                                : "#6b7280",
                          }}
                        >
                          {v.status}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px]"
                          style={{ color: "var(--studio-fg-muted)" }}
                        >
                          {v.generated_by}
                        </span>
                      </div>
                      {v.creative_brief && (
                        <p
                          className="truncate text-[11px]"
                          style={{ color: "var(--studio-fg-muted)" }}
                        >
                          {v.creative_brief}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivate(v.id);
                          }}
                          className="rounded px-2 py-1 text-[11px] transition-colors"
                          style={{ color: "#4ade80" }}
                          title="Promote to active"
                        >
                          ↑ Activate
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBranch(v.id);
                        }}
                        className="rounded px-2 py-1 text-[11px] transition-colors"
                        style={{ color: "var(--studio-fg-muted)" }}
                        title="Branch from here"
                      >
                        ⑆ Branch
                      </button>
                      {v.status !== "archived" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(v.id);
                          }}
                          className="rounded px-2 py-1 text-[11px] transition-colors"
                          style={{ color: "var(--studio-fg-muted)" }}
                          title="Archive"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
