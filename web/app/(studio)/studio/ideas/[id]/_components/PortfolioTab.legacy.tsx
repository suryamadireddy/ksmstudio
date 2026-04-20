"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea, PortfolioVersion } from "@/lib/types";
import { PortfolioRender } from "@/components/portfolio/PortfolioRender";
import { PortfolioGeneratePanel } from "./PortfolioGeneratePanel";

/** Archived Phase 4 portfolio tab — reference only; studio uses WorkspaceTab. */
export function PortfolioTab({ idea }: { idea: Idea }) {
  const router = useRouter();
  const portfolio = idea.portfolio;
  const versions: PortfolioVersion[] = portfolio?.versions ?? [];
  const activeVersionId = portfolio?.active_version_id ?? null;

  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    activeVersionId ?? versions[0]?.id ?? null,
  );

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;

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
      <PortfolioGeneratePanel ideaId={idea.id} />

      {versions.length === 0 && (
        <div
          className="py-8 text-center text-sm"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          No portfolio versions yet. Generate the first one above.
        </div>
      )}

      {versions.length > 0 && (
        <>
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
                <div
                  className="flex overflow-hidden rounded border"
                  style={{ borderColor: "var(--studio-border)" }}
                >
                  {(["light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreviewTheme(t)}
                      className="px-2.5 py-1 text-[11px] transition-colors"
                      style={{
                        backgroundColor:
                          previewTheme === t ? "var(--studio-amber)" : "transparent",
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
                {selectedVersion && selectedVersion.status !== "active" && (
                  <button
                    type="button"
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
                    type="button"
                    onClick={() => handleArchive(selectedVersion.id)}
                    className="rounded px-2.5 py-1 text-[11px] transition-colors"
                    style={{ color: "var(--studio-fg-muted)" }}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>

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
                          type="button"
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
                        type="button"
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
                          type="button"
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
