"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { PortfolioVersion, WorkingDraftSnapshot } from "@/lib/types";
import {
  formatShortTimestamp,
  formatSnapshotTriggerLabel,
  formatVersionRowLabel,
} from "./workspace-history-labels";

type ConfirmState =
  | { kind: "branch"; versionId: string }
  | { kind: "revert"; snapshotId: string }
  | null;

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: "active", bg: "rgba(74,222,128,0.15)", fg: "#4ade80" },
  draft: { label: "draft", bg: "rgba(240,180,41,0.12)", fg: "#f0b429" },
  archived: { label: "archived", bg: "rgba(107,114,128,0.15)", fg: "#9ca3af" },
};

export function WorkspaceHistoryDrawer({
  open,
  onClose,
  ideaId,
  versions,
  workingDraft,
  peekKey,
  onPeekVersion,
  onPeekSnapshot,
  onClearPeek,
}: {
  open: boolean;
  onClose: () => void;
  ideaId: string;
  versions: PortfolioVersion[];
  workingDraft: PortfolioVersion | null;
  peekKey: string | null;
  onPeekVersion: (version: PortfolioVersion | null) => void;
  onPeekSnapshot: (snapshot: WorkingDraftSnapshot) => void;
  onClearPeek: () => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedVersions = useMemo(
    () =>
      [...versions]
        .filter((v) => v.status !== "working_draft")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [versions],
  );

  const snapshots = useMemo(() => {
    if (!workingDraft?.snapshots?.length) return [];
    return [...workingDraft.snapshots].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [workingDraft?.snapshots]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleClose = useCallback(() => {
    setConfirm(null);
    setError(null);
    onClearPeek();
    onClose();
  }, [onClearPeek, onClose]);

  const runReplaceWorkingDraft = useCallback(
    async (sourceVersionId: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/replace-working-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_version_id: sourceVersionId }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "Could not replace working draft.");
          return;
        }
        setConfirm(null);
        onClearPeek();
        refresh();
      } catch {
        setError("Could not replace working draft.");
      } finally {
        setBusy(false);
      }
    },
    [ideaId, onClearPeek, refresh],
  );

  const runRevertSnapshot = useCallback(
    async (snapshotId: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/revert-to-snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot_id: snapshotId }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "Could not revert to snapshot.");
          return;
        }
        setConfirm(null);
        onClearPeek();
        refresh();
      } catch {
        setError("Could not revert to snapshot.");
      } finally {
        setBusy(false);
      }
    },
    [ideaId, onClearPeek, refresh],
  );

  const promote = useCallback(
    async (versionId: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/studio/ideas/${ideaId}/portfolio/versions/${versionId}/activate`, {
          method: "POST",
        });
        if (!res.ok) {
          setError("Could not promote version.");
          return;
        }
        refresh();
      } catch {
        setError("Could not promote version.");
      } finally {
        setBusy(false);
      }
    },
    [ideaId, refresh],
  );

  const archive = useCallback(
    async (versionId: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/studio/ideas/${ideaId}/portfolio/versions/${versionId}/archive`, {
          method: "POST",
        });
        if (!res.ok) {
          setError("Could not archive version.");
          return;
        }
        refresh();
      } catch {
        setError("Could not archive version.");
      } finally {
        setBusy(false);
      }
    },
    [ideaId, refresh],
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        role="presentation"
        aria-hidden
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-history-title"
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-full flex-col border-l shadow-2xl sm:max-w-md"
        style={{
          backgroundColor: "var(--studio-bg)",
          borderColor: "var(--studio-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--studio-border)" }}
        >
          <h2
            id="workspace-history-title"
            className="text-sm font-medium"
            style={{ color: "var(--studio-fg)", fontFamily: "var(--font-playfair, Georgia, serif)" }}
          >
            History
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-2 py-1 text-xs transition-colors"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {confirm?.kind === "branch" ? (
            <div
              className="mb-4 rounded border p-3"
              style={{ borderColor: "var(--studio-amber)", backgroundColor: "rgba(217,119,6,0.06)" }}
            >
              <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--studio-fg)" }}>
                Editing this version will discard your current working draft and its snapshots. Continue?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runReplaceWorkingDraft(confirm.versionId)}
                  className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
                >
                  {busy ? "Working…" : "Continue"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                  className="rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                  style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {confirm?.kind === "revert" ? (
            <div
              className="mb-4 rounded border p-3"
              style={{ borderColor: "var(--studio-border-strong)", backgroundColor: "var(--studio-bg-2)" }}
            >
              <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--studio-fg)" }}>
                Revert the working draft to this snapshot? Current unsaved edits in the draft will be replaced.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runRevertSnapshot(confirm.snapshotId)}
                  className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
                >
                  {busy ? "Reverting…" : "Revert"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                  className="rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                  style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mb-3 text-xs" style={{ color: "#f87171" }}>
              {error}
            </p>
          ) : null}

          <section className="mb-6">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--studio-amber-dim)" }}
            >
              Versions
            </p>
            {savedVersions.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                No saved versions yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {savedVersions.map((v) => {
                  const badge = STATUS_BADGE[v.status] ?? STATUS_BADGE.draft;
                  const selected = peekKey === `version:${v.id}`;
                  return (
                    <li key={v.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onPeekVersion(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onPeekVersion(v);
                          }
                        }}
                        className="w-full cursor-pointer rounded border px-3 py-2 text-left transition-colors"
                        style={{
                          borderColor: selected ? "var(--studio-amber)" : "var(--studio-border)",
                          backgroundColor: selected ? "rgba(217,119,6,0.06)" : "var(--studio-bg-2)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium" style={{ color: "var(--studio-fg)" }}>
                            {formatVersionRowLabel(v)}
                          </span>
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: badge.bg, color: badge.fg }}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px]" style={{ color: "var(--studio-fg-muted)" }}>
                          {formatShortTimestamp(v.created_at)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-0.5">
                        {(v.status === "draft" || v.status === "archived") && (
                          <button
                            type="button"
                            disabled={busy || confirm !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              void promote(v.id);
                            }}
                            className="rounded border px-2 py-1 text-[10px] font-medium disabled:opacity-40"
                            style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                          >
                            Promote to active
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy || confirm !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (workingDraft) {
                              setConfirm({ kind: "branch", versionId: v.id });
                            } else {
                              void runReplaceWorkingDraft(v.id);
                            }
                          }}
                          className="rounded border px-2 py-1 text-[10px] font-medium disabled:opacity-40"
                          style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                        >
                          Branch to working draft
                        </button>
                        {v.status === "draft" ? (
                          <button
                            type="button"
                            disabled={busy || confirm !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              void archive(v.id);
                            }}
                            className="rounded border px-2 py-1 text-[10px] font-medium disabled:opacity-40"
                            style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <details className="rounded-lg border" style={{ borderColor: "var(--studio-border)" }}>
            <summary
              className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-widest marker:content-none [&::-webkit-details-marker]:hidden"
              style={{ color: "var(--studio-amber-dim)" }}
            >
              Working draft snapshots
            </summary>
            <div className="border-t px-3 py-2" style={{ borderColor: "var(--studio-border)" }}>
              {!workingDraft ? (
                <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                  No working draft open.
                </p>
              ) : snapshots.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                  No snapshots yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {snapshots.map((snap) => {
                    const selected = peekKey === `snapshot:${snap.id}`;
                    return (
                      <li key={snap.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onPeekSnapshot(snap)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onPeekSnapshot(snap);
                            }
                          }}
                          className="w-full cursor-pointer rounded border px-3 py-2 text-left transition-colors"
                          style={{
                            borderColor: selected ? "var(--studio-amber)" : "var(--studio-border)",
                            backgroundColor: selected ? "rgba(217,119,6,0.06)" : "var(--studio-bg-2)",
                          }}
                        >
                          <span className="text-xs font-medium" style={{ color: "var(--studio-fg)" }}>
                            {formatSnapshotTriggerLabel(snap.trigger)}
                          </span>
                          <p className="mt-1 text-[10px]" style={{ color: "var(--studio-fg-muted)" }}>
                            {formatShortTimestamp(snap.created_at)}
                          </p>
                        </div>
                        <div className="mt-1.5 pl-0.5">
                          <button
                            type="button"
                            disabled={busy || confirm !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirm({ kind: "revert", snapshotId: snap.id });
                            }}
                            className="rounded border px-2 py-1 text-[10px] font-medium disabled:opacity-40"
                            style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                          >
                            Revert working draft to this snapshot
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
