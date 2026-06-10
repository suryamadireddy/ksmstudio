"use client";

import {
  WorkspaceProposalCard,
  type ProposalCardData,
  type ProposalCardStatus,
} from "./WorkspaceProposalCard";

export function proposedEditFromExtracted(extracted: unknown): ProposalCardData | null {
  if (!extracted || typeof extracted !== "object") return null;
  const proposal = (extracted as { proposed_edit?: unknown }).proposed_edit;
  if (!proposal || typeof proposal !== "object") return null;
  const p = proposal as { action?: unknown; target?: unknown; brief?: unknown };
  if (typeof p.action !== "string" || typeof p.brief !== "string") return null;
  return {
    action: p.action,
    target: typeof p.target === "string" ? p.target : null,
    brief: p.brief,
  };
}

/** Persisted studio state from `messages.extracted` — drives Accept / Accepted / etc. */
function persistedProposalStatusFromExtracted(extracted: unknown): "pending" | "accepted" | "rejected" | null {
  const proposal = proposedEditFromExtracted(extracted);
  if (!proposal) return null;
  if (!extracted || typeof extracted !== "object") return "pending";
  const status = (extracted as { proposal_status?: unknown }).proposal_status;
  if (status === "pending" || status === "accepted" || status === "rejected") return status;
  return "pending";
}

export function WorkspaceChatMessage({
  role,
  content,
  streaming,
  timestampLabel,
  extracted,
  transientProposalStatus,
  proposalError,
  proposalProgressLines,
  onAccept,
  onReject,
  onRetry,
}: {
  role: "user" | "idea";
  content: string;
  streaming?: boolean;
  timestampLabel?: string;
  /** Workspace message `extracted` JSON — single source of truth for proposal + persisted status */
  extracted?: unknown;
  transientProposalStatus?: "accepting" | "failed";
  proposalError?: string;
  proposalProgressLines?: string[];
  onAccept?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
}) {
  const isUser = role === "user";
  const proposal = proposedEditFromExtracted(extracted);
  const persisted = persistedProposalStatusFromExtracted(extracted);

  let cardStatus: ProposalCardStatus | undefined;
  if (transientProposalStatus === "accepting") cardStatus = "accepting";
  else if (transientProposalStatus === "failed") cardStatus = "failed";
  else if (persisted === "accepted") cardStatus = "accepted";
  else if (persisted === "rejected") cardStatus = "rejected";
  else if (persisted === "pending") cardStatus = "pending";
  else if (proposal) cardStatus = "pending";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[90%] rounded-xl px-3 py-2"
        style={{
          backgroundColor: isUser ? "var(--studio-bg-3)" : "var(--studio-bg-2)",
          border: `1px solid ${isUser ? "var(--studio-border-strong)" : "var(--studio-border)"}`,
          borderLeft: !isUser ? "2px solid var(--studio-amber-dim)" : undefined,
        }}
      >
        {!isUser ? (
          <p
            className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-amber-dim)" }}
          >
            idea
          </p>
        ) : null}
        <p
          className="text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: isUser ? "var(--studio-fg)" : "var(--studio-fg-muted)" }}
        >
          {content}
          {streaming ? (
            <span
              className="ml-1 inline-block h-3 w-0.5 animate-pulse"
              style={{ backgroundColor: "var(--studio-fg-muted)" }}
            />
          ) : null}
        </p>
        {timestampLabel ? (
          <p className="mt-1 text-[10px]" style={{ color: "var(--studio-border-strong)" }}>
            {timestampLabel}
          </p>
        ) : null}

        {!isUser && proposal && cardStatus ? (
          <WorkspaceProposalCard
            proposal={proposal}
            status={cardStatus}
            errorMessage={proposalError}
            progressLines={proposalProgressLines}
            onAccept={onAccept}
            onReject={onReject}
            onRetry={onRetry}
          />
        ) : null}
      </div>
    </div>
  );
}
