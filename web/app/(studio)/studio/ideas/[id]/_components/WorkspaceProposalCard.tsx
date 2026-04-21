"use client";

import { useEffect, useState } from "react";

export type ProposalCardStatus = "pending" | "accepting" | "accepted" | "rejected" | "failed";

export interface ProposalCardData {
  action: string;
  target: string | null;
  brief: string;
}

export function WorkspaceProposalCard({
  proposal,
  status,
  errorMessage,
  progressLines,
  onAccept,
  onReject,
  onRetry,
}: {
  proposal: ProposalCardData;
  status: ProposalCardStatus;
  errorMessage?: string;
  progressLines?: string[];
  onAccept?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const lines = progressLines ?? [];

  useEffect(() => {
    if (status !== "accepting" && status !== "failed") {
      setShowDetails(false);
    }
  }, [status]);

  const pending = status === "pending";
  const accepting = status === "accepting";
  const accepted = status === "accepted";
  const rejected = status === "rejected";
  const failed = status === "failed";

  return (
    <div
      className="mt-2 rounded-lg border px-3 py-2"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "var(--studio-bg-2)",
      }}
    >
      <p
        className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber-dim)" }}
      >
        Proposed edit
      </p>
      <p className="text-xs" style={{ color: "var(--studio-fg)" }}>
        <span className="font-medium">{proposal.action}</span>
        {proposal.target ? ` — ${proposal.target}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>
        {proposal.brief}
      </p>

      {pending ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="rounded px-2 py-1 text-[11px] font-medium transition-colors"
            style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="rounded border px-2 py-1 text-[11px] transition-colors"
            style={{ borderColor: "var(--studio-border-strong)", color: "var(--studio-fg-muted)" }}
          >
            Reject
          </button>
        </div>
      ) : null}

      {accepting ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            Refining...
          </div>
          {lines.length > 0 ? (
            <>
              <button
                type="button"
                className="text-[11px] underline-offset-2 hover:underline"
                style={{ color: "var(--studio-amber-dim)" }}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "hide details" : "show details"}
              </button>
              {showDetails ? (
                <div
                  className="max-h-28 overflow-y-auto rounded border p-2 font-mono text-[10px]"
                  style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                >
                  {lines.map((line, idx) => (
                    <p key={`${idx}-${line.slice(0, 16)}`}>{line}</p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {accepted ? (
        <p className="mt-2 text-[11px] font-medium" style={{ color: "#86efac" }}>
          Accepted ✓
        </p>
      ) : null}

      {rejected ? (
        <p className="mt-2 text-[11px] font-medium" style={{ color: "var(--studio-fg-muted)" }}>
          Rejected
        </p>
      ) : null}

      {failed ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-medium" style={{ color: "#f87171" }}>
            {errorMessage || "Edit didn't land. Your draft is unchanged. Try again?"}
          </p>
          {lines.length > 0 ? (
            <>
              <button
                type="button"
                className="text-[11px] underline-offset-2 hover:underline"
                style={{ color: "var(--studio-amber-dim)" }}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "hide details" : "show details"}
              </button>
              {showDetails ? (
                <div
                  className="max-h-28 overflow-y-auto rounded border p-2 font-mono text-[10px]"
                  style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
                >
                  {lines.map((line, idx) => (
                    <p key={`${idx}-${line.slice(0, 16)}`}>{line}</p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="rounded border px-2 py-1 text-[11px] transition-colors"
            style={{ borderColor: "var(--studio-border-strong)", color: "var(--studio-fg-muted)" }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

