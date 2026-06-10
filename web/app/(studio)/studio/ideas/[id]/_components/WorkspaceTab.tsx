"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  defaultSignaturePlacementForTemplate,
  PortfolioRender,
} from "@/components/portfolio/PortfolioRender";
import {
  alignPublicSummaryWithPresentationSections,
  applyPresentationPatch as mergePresentationFromPatch,
  type PresentationPatch,
} from "@/lib/portfolio/workspace-helpers";
import {
  ideaDisplayName,
  type AccentColor,
  type Idea,
  type LayoutTemplate,
  type PortfolioVersion,
  type PresentationSection,
  type PresentationSpec,
  type RenderedSection,
  type SignaturePlacement,
  type WorkingDraftSnapshot,
} from "@/lib/types";
import { PortfolioGeneratePanel } from "./PortfolioGeneratePanel";
import { WorkspaceChatPane } from "./WorkspaceChatPane";
import { WorkspaceHistoryDrawer } from "./WorkspaceHistoryDrawer";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { WorkspaceToolbar } from "./WorkspaceToolbar";

/** Synchronous guard so React StrictMode double-mount cannot fire two POST /open races. */
const workspaceOpenInFlight = new Set<string>();

function isFloatingWithDims(p: SignaturePlacement): boolean {
  return (
    p.mode === "floating" &&
    typeof p.x_pct === "number" &&
    typeof p.y_pct === "number" &&
    typeof p.width_pct === "number" &&
    typeof p.height_pct === "number"
  );
}

/** Read-only center preview for a working-draft snapshot row in History. */
function versionForSnapshotPeek(base: PortfolioVersion, snap: WorkingDraftSnapshot): PortfolioVersion {
  return {
    ...base,
    presentation: structuredClone(snap.presentation),
    public_summary: structuredClone(snap.public_summary),
    chatbot_context: structuredClone(snap.chatbot_context),
    voice: structuredClone(snap.voice),
    id: `${base.id}::peek::${snap.id}`,
  };
}

export function WorkspaceTab({ idea }: { idea: Idea }) {
  const router = useRouter();
  const portfolio = idea.portfolio;
  const versions = portfolio?.versions ?? [];
  const activeVersionId = portfolio?.active_version_id ?? null;

  const workingDraft = useMemo(
    () => versions.find((v) => v.status === "working_draft") ?? null,
    [versions],
  );
  const workingDraftRef = useRef(workingDraft);
  workingDraftRef.current = workingDraft;
  const activeVersion = useMemo(
    () =>
      versions.find((v) => v.id === activeVersionId && v.status === "active") ?? null,
    [versions, activeVersionId],
  );

  const previewVersionBase: PortfolioVersion | null = workingDraft ?? activeVersion;

  const presentationRef = useRef<PresentationSpec | null>(null);
  const [presentation, setPresentation] = useState<PresentationSpec | null>(null);
  const [publicSummaryOverride, setPublicSummaryOverride] = useState<{
    sections: RenderedSection[];
  } | null>(null);
  const publicSummaryOverrideRef = useRef(publicSummaryOverride);
  publicSummaryOverrideRef.current = publicSummaryOverride;
  const [toolbarError, setToolbarError] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [placementDraft, setPlacementDraft] = useState<SignaturePlacement | undefined>(undefined);

  const [previewTheme] = useState<"light" | "dark">("light");
  const [progressLabel, setProgressLabel] = useState("Idle");
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** When History drawer is open, temporarily overrides center `PortfolioRender` (read-only). */
  const [historyPeek, setHistoryPeek] = useState<PortfolioVersion | null>(null);
  /** Desktop (lg+) only: thin strip collapse for toolbar / chat columns */
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const toolbarPanelId = useId();
  const chatPanelId = useId();

  const openAttemptedRef = useRef(false);

  const hasWorking = workingDraft != null;
  const workingDraftId = workingDraft?.id ?? null;

  useEffect(() => {
    if (!workingDraft) {
      setPresentation(null);
      presentationRef.current = null;
      setPublicSummaryOverride(null);
      setPlacementMode(false);
      setPlacementDraft(undefined);
      return;
    }
    const p = structuredClone(workingDraft.presentation);
    setPresentation(p);
    presentationRef.current = p;
    setPublicSummaryOverride(null);
    setPlacementMode(false);
    setPlacementDraft(undefined);
  }, [workingDraft?.id]);

  const applyPatch = useCallback(
    async (patch: PresentationPatch): Promise<boolean> => {
      const cur = presentationRef.current;
      if (!cur) return false;
      const summarySnap = publicSummaryOverrideRef.current;
      let next: PresentationSpec;
      try {
        next = mergePresentationFromPatch(cur, patch);
      } catch {
        setToolbarError("That change didn't save. Try again?");
        window.setTimeout(() => setToolbarError(null), 4000);
        return false;
      }
      const prev = structuredClone(cur);
      presentationRef.current = next;
      setPresentation(next);
      if (patch.sections !== undefined) {
        const wd = workingDraftRef.current;
        const oldPub = publicSummaryOverrideRef.current ?? wd?.public_summary ?? { sections: [] };
        const aligned = alignPublicSummaryWithPresentationSections(cur, oldPub, next.sections);
        publicSummaryOverrideRef.current = aligned;
        setPublicSummaryOverride(aligned);
      }
      try {
        const res = await fetch(`/api/studio/ideas/${idea.id}/workspace/update`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presentation: patch }),
        });
        if (!res.ok) throw new Error("patch_failed");
        return true;
      } catch {
        presentationRef.current = prev;
        setPresentation(prev);
        publicSummaryOverrideRef.current = summarySnap;
        setPublicSummaryOverride(summarySnap);
        if (patch.signature_placement !== undefined) {
          setPlacementMode(false);
          setPlacementDraft(undefined);
        }
        setToolbarError("That change didn't save. Try again?");
        window.setTimeout(() => setToolbarError(null), 4000);
        return false;
      }
    },
    [idea.id],
  );

  const cancelPlacement = useCallback(() => {
    setPlacementMode(false);
    setPlacementDraft(undefined);
  }, []);

  const beginPlacement = useCallback(() => {
    if (!presentation) return;
    setPlacementMode(true);
    const cur =
      presentation.signature_placement ??
      defaultSignaturePlacementForTemplate(presentation.layout_template);
    if (isFloatingWithDims(cur)) {
      setPlacementDraft({
        mode: "floating",
        x_pct: cur.x_pct,
        y_pct: cur.y_pct,
        width_pct: cur.width_pct,
        height_pct: cur.height_pct,
      });
    } else {
      setPlacementDraft({
        mode: "floating",
        x_pct: 50,
        y_pct: 46,
        width_pct: 36,
        height_pct: 26,
      });
    }
  }, [presentation]);

  const commitSignatureFromPreview = useCallback(
    async (p: SignaturePlacement) => {
      const ok = await applyPatch({ signature_placement: p });
      if (ok) {
        setPlacementMode(false);
        setPlacementDraft(undefined);
      }
    },
    [applyPatch],
  );

  const onPlacementDraft = useCallback((p: SignaturePlacement) => {
    setPlacementDraft(p);
  }, []);

  const mergedPreviewVersion = useMemo(() => {
    if (!previewVersionBase) return null;
    if (workingDraft && presentation && previewVersionBase.id === workingDraft.id) {
      const public_summary = publicSummaryOverride ?? workingDraft.public_summary;
      return { ...workingDraft, presentation, public_summary };
    }
    return previewVersionBase;
  }, [workingDraft, presentation, previewVersionBase, publicSummaryOverride]);

  const centerPreviewVersion = useMemo(
    () => historyPeek ?? mergedPreviewVersion,
    [historyPeek, mergedPreviewVersion],
  );

  const historyPeekKey = useMemo(() => {
    if (!historyPeek) return null;
    const parts = historyPeek.id.split("::peek::");
    if (parts.length === 2) return `snapshot:${parts[1]}`;
    return `version:${historyPeek.id}`;
  }, [historyPeek]);

  const signaturePlacementOverride =
    placementMode && placementDraft !== undefined ? placementDraft : undefined;

  useEffect(() => {
    if (versions.length === 0 || hasWorking || openAttemptedRef.current) return;
    if (workspaceOpenInFlight.has(idea.id)) return;
    workspaceOpenInFlight.add(idea.id);
    openAttemptedRef.current = true;
    let cancelled = false;
    void (async () => {
      setProgressLabel("Opening workspace…");
      try {
        const res = await fetch(`/api/studio/ideas/${idea.id}/workspace/open`, {
          method: "POST",
        });
        if (cancelled) return;
        if (res.status === 409) {
          openAttemptedRef.current = false;
          setProgressLabel("Needs initial generation");
          return;
        }
        if (!res.ok) {
          openAttemptedRef.current = false;
          setProgressLabel("Could not open workspace");
          return;
        }
        setProgressLabel("Idle");
        router.refresh();
      } catch {
        if (!cancelled) {
          openAttemptedRef.current = false;
          setProgressLabel("Could not open workspace");
        }
      } finally {
        workspaceOpenInFlight.delete(idea.id);
      }
    })();
    return () => {
      cancelled = true;
      workspaceOpenInFlight.delete(idea.id);
    };
  }, [idea.id, versions.length, hasWorking, router]);

  useEffect(() => {
    if (!workingDraftId) return;
    const id = window.setInterval(() => {
      void fetch(`/api/studio/ideas/${idea.id}/workspace/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "autosave" }),
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [workingDraftId, idea.id]);

  const versionLabel =
    workingDraft != null
      ? "Working draft"
      : versions.length > 0 && !hasWorking
        ? "Opening workspace…"
        : activeVersion != null
          ? "Active"
          : "—";

  if (versions.length === 0) {
    return (
      <div className="space-y-6">
        <PortfolioGeneratePanel ideaId={idea.id} />
        <p className="py-4 text-center text-sm" style={{ color: "var(--studio-fg-muted)" }}>
          No portfolio versions yet. Generate the first one above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full min-w-0 pb-8">
        <div className="mb-6">
          <WorkspaceTopBar
            ideaTitle={ideaDisplayName(idea)}
            versionLabel={versionLabel}
            progressLabel={progressLabel}
            onSaveAsVersion={() => {
              /* Step 7 */
            }}
            onHistory={() => setHistoryOpen(true)}
            onRegenerate={() => setRegenerateOpen(true)}
            regenerateActive={regenerateOpen}
          />
        </div>

        <div className="mx-auto w-full max-w-[1600px]">
          <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
            {/* Toolbar column — sticky on lg+; collapsible to strip on desktop */}
            <aside
              className={`flex w-full shrink-0 flex-col gap-2 lg:sticky lg:top-6 lg:self-start ${
                toolbarCollapsed ? "lg:w-8 lg:max-w-8" : "lg:w-[280px] lg:max-w-[280px]"
              }`}
            >
              <button
                type="button"
                className="hidden h-8 w-full shrink-0 items-center justify-center rounded border transition-colors lg:flex"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-bg-2)",
                  color: "var(--studio-fg-muted)",
                }}
                aria-expanded={!toolbarCollapsed}
                aria-controls={toolbarPanelId}
                aria-label={toolbarCollapsed ? "Expand workspace toolbar column" : "Collapse workspace toolbar column"}
                onClick={() => setToolbarCollapsed((c) => !c)}
              >
                {toolbarCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
              <div
                id={toolbarPanelId}
                className={`min-w-0 flex flex-col gap-2 ${toolbarCollapsed ? "lg:hidden" : ""}`}
              >
                {workingDraft && presentation ? (
                  <>
                    {toolbarError ? (
                      <p className="rounded border px-3 py-2 text-xs" style={{ borderColor: "#f87171", color: "#f87171" }}>
                        {toolbarError}
                      </p>
                    ) : null}
                    <WorkspaceToolbar
                      presentation={presentation}
                      placementModeActive={placementMode}
                      onTemplateChange={(t: LayoutTemplate) => {
                        cancelPlacement();
                        void applyPatch({ layout_template: t });
                      }}
                      onAccentChange={(a: AccentColor) => {
                        cancelPlacement();
                        void applyPatch({ accent_color: a });
                      }}
                      onSectionsChange={(next: PresentationSection[]) => {
                        cancelPlacement();
                        void applyPatch({ sections: next });
                      }}
                      onBeginSignaturePlacement={beginPlacement}
                      onResetSignaturePlacement={() => {
                        cancelPlacement();
                        void applyPatch({ signature_placement: null });
                      }}
                    />
                  </>
                ) : (
                  <div
                    className="flex min-h-[120px] items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm font-medium"
                    style={{
                      borderColor: "var(--studio-border-strong)",
                      backgroundColor: "var(--studio-bg-2)",
                      color: "var(--studio-fg-muted)",
                    }}
                  >
                    Toolbar available when a working draft is open.
                  </div>
                )}
              </div>
            </aside>

            {/* Preview — natural height; page scrolls */}
            <div className="min-w-0 w-full flex-1">
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                Live preview
              </p>
              <div
                data-workspace-preview="true"
                className="w-full rounded-lg border"
                style={{ borderColor: "var(--studio-border)" }}
              >
                {centerPreviewVersion ? (
                  <div
                    data-theme={previewTheme}
                    data-accent={centerPreviewVersion.presentation.accent_color}
                    className="w-full"
                  >
                    <PortfolioRender
                      version={centerPreviewVersion}
                      editMode={Boolean(
                        workingDraft &&
                          centerPreviewVersion.id === workingDraft.id &&
                          !historyPeek,
                      )}
                      placementMode={Boolean(workingDraft && !historyPeek && placementMode)}
                      signaturePlacementOverride={historyPeek ? undefined : signaturePlacementOverride}
                      onSignaturePlacementDraft={
                        workingDraft && !historyPeek && placementMode ? onPlacementDraft : undefined
                      }
                      onPlacementCancel={workingDraft && !historyPeek && placementMode ? cancelPlacement : undefined}
                      onSignatureMove={
                        workingDraft && !historyPeek && centerPreviewVersion.id === workingDraft.id
                          ? commitSignatureFromPreview
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <div
                    className="flex min-h-[200px] items-center justify-center p-6 text-sm"
                    style={{ color: "var(--studio-fg-muted)" }}
                  >
                    No preview yet.
                  </div>
                )}
              </div>
            </div>

            {/* Chat — sticky column; collapsible to strip on desktop */}
            <aside
              className={`flex w-full shrink-0 flex-col gap-2 lg:sticky lg:top-6 lg:self-start ${
                chatCollapsed ? "lg:w-8 lg:max-w-8" : "lg:w-[360px] lg:max-w-[360px]"
              }`}
            >
              <button
                type="button"
                className="hidden h-8 w-full shrink-0 items-center justify-center rounded border transition-colors lg:flex"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-bg-2)",
                  color: "var(--studio-fg-muted)",
                }}
                aria-expanded={!chatCollapsed}
                aria-controls={chatPanelId}
                aria-label={chatCollapsed ? "Expand workspace chat column" : "Collapse workspace chat column"}
                onClick={() => setChatCollapsed((c) => !c)}
              >
                {chatCollapsed ? (
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
              <div id={chatPanelId} className={`min-w-0 ${chatCollapsed ? "lg:hidden" : ""}`}>
                <WorkspaceChatPane ideaId={idea.id} workingDraftId={workingDraftId} />
              </div>
            </aside>
          </div>
        </div>
      </div>

      <WorkspaceHistoryDrawer
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryPeek(null);
        }}
        ideaId={idea.id}
        versions={versions}
        workingDraft={workingDraft}
        peekKey={historyPeekKey}
        onPeekVersion={(v) => setHistoryPeek(v ? structuredClone(v) : null)}
        onPeekSnapshot={(snap) => {
          if (!workingDraft) return;
          setHistoryPeek(versionForSnapshotPeek(workingDraft, snap));
        }}
        onClearPeek={() => setHistoryPeek(null)}
      />

      {regenerateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          role="presentation"
          onClick={() => setRegenerateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-regenerate-title"
            className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg p-6"
            style={{
              backgroundColor: "var(--studio-bg)",
              borderColor: "var(--studio-border)",
              border: "1px solid",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="workspace-regenerate-title"
                className="text-base font-medium"
                style={{ color: "var(--studio-fg)", fontFamily: "var(--font-playfair, Georgia, serif)" }}
              >
                Generate portfolio content
              </h2>
              <button
                type="button"
                onClick={() => setRegenerateOpen(false)}
                className="shrink-0 rounded px-2 py-1 text-xs transition-colors"
                style={{ color: "var(--studio-fg-muted)" }}
              >
                Close
              </button>
            </div>
            <p className="mb-4 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
              Optional creative brief and distillation — same flow as the first version.
            </p>
            <PortfolioGeneratePanel
              ideaId={idea.id}
              onDistillSuccess={() => setRegenerateOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
