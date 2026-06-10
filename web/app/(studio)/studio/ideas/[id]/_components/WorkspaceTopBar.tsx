"use client";

/**
 * Workspace chrome: version summary, progress, primary actions.
 * TODO(krishna): Publish control — hidden until publish-from-saved-version wiring; show when a saved (non–working-draft) version is selected per spec 6.3.
 */
export function WorkspaceTopBar({
  ideaTitle,
  versionLabel,
  progressLabel,
  onSaveAsVersion,
  onHistory,
  onRegenerate,
  regenerateActive,
}: {
  ideaTitle: string;
  versionLabel: string;
  progressLabel: string;
  onSaveAsVersion: () => void;
  onHistory: () => void;
  onRegenerate?: () => void;
  regenerateActive?: boolean;
}) {
  return (
    <header
      className="flex min-h-12 flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      style={{ borderColor: "var(--studio-border)" }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          style={{ color: "var(--studio-fg)", fontFamily: "var(--font-playfair, Georgia, serif)" }}
        >
          {ideaTitle}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-amber-dim)" }}
          >
            Version
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--studio-fg)" }}>
            {versionLabel}
          </span>
          <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
            {progressLabel}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          title="Save as version — Step 7"
          onClick={onSaveAsVersion}
          className="rounded border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: "var(--studio-border)",
            color: "var(--studio-fg)",
          }}
        >
          Save as version
        </button>
        <button
          type="button"
          title="History — Step 10"
          onClick={onHistory}
          className="rounded border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: "var(--studio-border)",
            color: "var(--studio-fg)",
          }}
        >
          History
        </button>
        {onRegenerate != null ? (
          <button
            type="button"
            title="Generate portfolio content from an optional creative brief"
            onClick={onRegenerate}
            aria-pressed={regenerateActive === true}
            className="rounded border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor: regenerateActive ? "var(--studio-amber)" : "var(--studio-border)",
              color: regenerateActive ? "var(--studio-amber)" : "var(--studio-fg)",
            }}
          >
            Regenerate
          </button>
        ) : null}
      </div>
    </header>
  );
}
