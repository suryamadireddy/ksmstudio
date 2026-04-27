"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { proposedEditFromExtracted, WorkspaceChatMessage } from "./WorkspaceChatMessage";
import type { ProposalCardData } from "./WorkspaceProposalCard";

interface UiMessage {
  id: string;
  role: "user" | "idea";
  content: string;
  createdAt: string;
  /** Mirrors DB `messages.extracted` — proposal card reads this every render */
  extracted?: unknown;
  streaming?: boolean;
}

interface ProposalTransientState {
  status: "accepting" | "failed";
  error?: string;
  progressLines: string[];
}

type SseEventHandler = (event: string, payload: unknown) => void;

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Date.now() - t;
  if (!Number.isFinite(d) || d < 0) return "just now";
  const sec = Math.floor(d / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

async function readEventStream(res: Response, onEvent: SseEventHandler): Promise<void> {
  if (!res.body) throw new Error("missing_stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        onEvent(event, data);
      }
    }
  }
}

export function WorkspaceChatPane({
  ideaId,
  workingDraftId,
}: {
  ideaId: string;
  workingDraftId: string | null;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalTransientById, setProposalTransientById] = useState<Record<string, ProposalTransientState>>({});
  const [distillStatus, setDistillStatus] = useState<{ status: string; last_attempt_at: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadHistory = useCallback(async () => {
    if (!workingDraftId) {
      setConversationId(null);
      setMessages([]);
      setProposalTransientById({});
      return;
    }
    const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/chat/history`, { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load chat history.");
      return;
    }
    const data = (await res.json()) as {
      conversationId: string | null;
      messages: Array<{
        id: string;
        role: "user" | "idea";
        content: string;
        extracted: unknown;
        created_at: string;
      }>;
    };
    setConversationId(data.conversationId);
    setMessages(
      (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        extracted: m.extracted ?? undefined,
      })),
    );
    setProposalTransientById({});
  }, [ideaId, workingDraftId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!workingDraftId) {
      setDistillStatus(null);
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const isInProgress = (status: string | undefined) =>
      status === "in_progress" || status === "running";

    const clearPolling = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const applyPayload = (data: { status?: string; last_attempt_at?: string }) => {
      if (!isInProgress(data.status) || typeof data.last_attempt_at !== "string") {
        clearPolling();
        setDistillStatus(null);
        return false;
      }
      setDistillStatus({
        status: data.status,
        last_attempt_at: data.last_attempt_at,
      });
      return true;
    };

    const pollOnce = async () => {
      try {
        const res = await fetch(
          `/api/studio/ideas/${ideaId}/workspace/distillation-status`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          clearPolling();
          setDistillStatus(null);
          return;
        }
        const data = (await res.json()) as { status?: string; last_attempt_at?: string };
        if (cancelled) return;
        applyPayload(data);
      } catch {
        if (cancelled) return;
        clearPolling();
        setDistillStatus(null);
      }
    };

    void (async () => {
      try {
        const res = await fetch(
          `/api/studio/ideas/${ideaId}/workspace/distillation-status`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setDistillStatus(null);
          return;
        }
        const data = (await res.json()) as { status?: string; last_attempt_at?: string };
        if (cancelled) return;
        const still = applyPayload(data);
        if (!still || cancelled) return;
        intervalId = window.setInterval(() => {
          void pollOnce();
        }, 4000);
      } catch {
        if (!cancelled) setDistillStatus(null);
      }
    })();

    return () => {
      cancelled = true;
      clearPolling();
    };
  }, [ideaId, workingDraftId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposalTransientById]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  const updateMessageById = useCallback(
    (id: string, patch: Partial<UiMessage> | ((message: UiMessage) => UiMessage)) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          return typeof patch === "function" ? patch(m) : { ...m, ...patch };
        }),
      );
    },
    [],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !workingDraftId) return;
    setInput("");
    setSending(true);
    setError(null);

    const tempUser: UiMessage = {
      id: `u-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const tempAssistantId = `a-${crypto.randomUUID()}`;
    const tempAssistant: UiMessage = {
      id: tempAssistantId,
      role: "idea",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    setMessages((prev) => [...prev, tempUser, tempAssistant]);

    const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        conversationId: conversationId ?? undefined,
        message: text,
      }),
    });
    if (!res.ok) {
      setSending(false);
      setError("Message failed. Try again?");
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id && m.id !== tempAssistantId));
      return;
    }

    const finalAssistantIdRef = { current: tempAssistantId };
    try {
      await readEventStream(res, (event, payload) => {
        if (event === "conversation") {
          const p = payload as { conversationId?: string };
          if (p.conversationId) setConversationId(p.conversationId);
          return;
        }
        if (event === "assistant_delta") {
          const p = payload as { text?: string };
          const delta = p.text ?? "";
          if (!delta) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === finalAssistantIdRef.current
                ? {
                    ...m,
                    content: m.content + delta,
                    streaming: true,
                  }
                : m,
            ),
          );
          return;
        }
        if (event === "assistant_done") {
          const p = payload as {
            text?: string;
            messageId?: string;
            proposal?: { action: string; target: string | null; brief: string };
          };
          const messageId = p.messageId ?? finalAssistantIdRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === finalAssistantIdRef.current
                ? {
                    ...m,
                    id: messageId,
                    content: p.text ?? m.content,
                    streaming: false,
                    ...(p.proposal
                      ? {
                          extracted: {
                            proposed_edit: {
                              action: p.proposal.action,
                              target: p.proposal.target ?? null,
                              brief: p.proposal.brief,
                            },
                            proposal_status: "pending" as const,
                          },
                        }
                      : {}),
                  }
                : m,
            ),
          );
          finalAssistantIdRef.current = messageId;
          return;
        }
        if (event === "proposed_edit") {
          const p = payload as ProposalCardData & { messageId?: string };
          const messageId = p.messageId ?? finalAssistantIdRef.current;
          updateMessageById(messageId, (m) => {
            const prevEx = m.extracted && typeof m.extracted === "object" ? (m.extracted as Record<string, unknown>) : {};
            return {
              ...m,
              extracted: {
                ...prevEx,
                proposed_edit: {
                  action: p.action,
                  target: p.target ?? null,
                  brief: p.brief,
                },
                proposal_status: "pending",
              },
            };
          });
          return;
        }
      });
    } catch {
      setError("Message stream interrupted. Try again?");
      updateMessageById(finalAssistantIdRef.current, { streaming: false });
    } finally {
      setSending(false);
    }
  }, [conversationId, ideaId, input, sending, updateMessageById, workingDraftId]);

  const acceptProposal = useCallback(
    async (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!proposedEditFromExtracted(msg?.extracted) || !workingDraftId) return;
      setError(null);
      setProposalTransientById((prev) => ({
        ...prev,
        [messageId]: { status: "accepting", progressLines: [] },
      }));

      const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "accept_proposal",
          conversationId: conversationId ?? undefined,
          proposalMessageId: messageId,
        }),
      });
      if (!res.ok) {
        setProposalTransientById((prev) => ({
          ...prev,
          [messageId]: {
            status: "failed",
            error: "That edit didn't start. Try again?",
            progressLines: prev[messageId]?.progressLines ?? [],
          },
        }));
        return;
      }

      try {
        await readEventStream(res, (event, payload) => {
          if (event === "distill_progress") {
            const p = payload as { text?: string };
            const lines = (p.text ?? "")
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean);
            if (lines.length === 0) return;
            setProposalTransientById((prev) => {
              const cur = prev[messageId];
              if (!cur || cur.status !== "accepting") return prev;
              return {
                ...prev,
                [messageId]: {
                  ...cur,
                  progressLines: [...cur.progressLines, ...lines].slice(-200),
                },
              };
            });
            return;
          }
          if (event === "distill_done") {
            updateMessageById(messageId, (m) => {
              const prevEx = m.extracted && typeof m.extracted === "object" ? (m.extracted as Record<string, unknown>) : {};
              return {
                ...m,
                extracted: {
                  ...prevEx,
                  proposal_status: "accepted",
                  proposal_accepted_at: new Date().toISOString(),
                },
              };
            });
            setProposalTransientById((prev) => {
              const next = { ...prev };
              delete next[messageId];
              return next;
            });
            void router.refresh();
            void loadHistory();
            return;
          }
          if (event === "distill_error") {
            const p = payload as { error?: string };
            setProposalTransientById((prev) => ({
              ...prev,
              [messageId]: {
                status: "failed",
                error: p.error || "Edit didn't land. Your draft is unchanged. Try again?",
                progressLines: prev[messageId]?.progressLines ?? [],
              },
            }));
            return;
          }
        });
      } catch {
        setProposalTransientById((prev) => ({
          ...prev,
          [messageId]: {
            status: "failed",
            error: "Edit stream interrupted. Try again?",
            progressLines: prev[messageId]?.progressLines ?? [],
          },
        }));
      }
    },
    [conversationId, ideaId, loadHistory, messages, router, updateMessageById, workingDraftId],
  );

  const rejectProposal = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/studio/ideas/${ideaId}/workspace/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reject_proposal",
          conversationId: conversationId ?? undefined,
          proposalMessageId: messageId,
        }),
      });
      if (!res.ok) {
        setError("Reject failed. Try again?");
        return;
      }
      updateMessageById(messageId, (m) => {
        const prevEx = m.extracted && typeof m.extracted === "object" ? (m.extracted as Record<string, unknown>) : {};
        return {
          ...m,
          extracted: {
            ...prevEx,
            proposal_status: "rejected",
            proposal_rejected_at: new Date().toISOString(),
          },
        };
      });
      setProposalTransientById((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    },
    [conversationId, ideaId, updateMessageById],
  );

  return (
    <div
      className="flex w-full flex-col rounded-lg border"
      style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg)" }}
    >
      <div className="flex max-h-[min(72vh,42rem)] flex-col gap-2 overflow-y-auto p-3">
        {distillStatus ? (
          <div
            className="rounded border px-3 py-2 text-[11px]"
            style={{
              color: "var(--studio-amber-dim)",
              backgroundColor: "var(--studio-bg-2)",
              borderColor: "var(--studio-border)",
            }}
          >
            {`Distillation in progress — started ${(() => {
              const t = new Date(distillStatus.last_attempt_at).getTime();
              const d = Date.now() - t;
              const sec = Math.floor(d / 1000);
              if (!Number.isFinite(d) || d < 0) return relativeTime(distillStatus.last_attempt_at);
              if (sec < 60) return `${sec} seconds ago`;
              return relativeTime(distillStatus.last_attempt_at);
            })()}`}
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>
            Chat with your idea about presentation edits.
          </p>
        ) : (
          messages.map((m) => {
            const transient = proposalTransientById[m.id];
            const hasProposal = Boolean(proposedEditFromExtracted(m.extracted));
            return (
              <WorkspaceChatMessage
                key={m.id}
                role={m.role}
                content={m.content}
                streaming={m.streaming}
                timestampLabel={relativeTime(m.createdAt)}
                extracted={m.extracted}
                transientProposalStatus={transient?.status === "accepting" || transient?.status === "failed" ? transient.status : undefined}
                proposalError={transient?.error}
                proposalProgressLines={transient?.progressLines}
                onAccept={hasProposal ? () => void acceptProposal(m.id) : undefined}
                onReject={hasProposal ? () => void rejectProposal(m.id) : undefined}
                onRetry={hasProposal ? () => void acceptProposal(m.id) : undefined}
              />
            );
          })
        )}
        {error ? (
          <p className="text-xs" style={{ color: "#f87171" }}>
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--studio-border)" }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder={workingDraftId ? "Ask your idea to refine presentation..." : "Open a working draft to chat"}
            disabled={sending || !workingDraftId}
            className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded border px-3 py-2 text-xs focus:outline-none disabled:opacity-60"
            style={{
              borderColor: "var(--studio-border)",
              backgroundColor: "var(--studio-bg-2)",
              color: "var(--studio-fg)",
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim() || !workingDraftId}
            className="rounded px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

