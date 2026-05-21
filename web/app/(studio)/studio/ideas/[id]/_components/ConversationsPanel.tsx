"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Conversation, Message } from "@/lib/types";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  return `${Math.floor(diff / d)}d ago`;
}

interface LiveMessage {
  role: "user" | "idea";
  content: string;
  streaming?: boolean;
}

// ─── Past session viewer ──────────────────────────────────────────────────────

function PastSession({
  conv,
  messages,
}: {
  conv: Conversation;
  messages: Message[];
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {conv.summary && (
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-bg-2)" }}
        >
          <p
            className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-amber-dim)" }}
          >
            Session Summary
          </p>
          <p
            className="text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            {conv.summary}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-xl px-4 py-3"
                style={{
                  backgroundColor: isUser ? "var(--studio-bg-3)" : "var(--studio-bg-2)",
                  border: `1px solid ${isUser ? "var(--studio-border-strong)" : "var(--studio-border)"}`,
                  borderLeft: !isUser ? "2px solid var(--studio-amber-dim)" : undefined,
                }}
              >
                {!isUser && (
                  <p
                    className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--studio-amber-dim)" }}
                  >
                    idea
                  </p>
                )}
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--studio-fg-muted)" }}
                >
                  {msg.content}
                </p>
                <p className="mt-1.5 text-[10px]" style={{ color: "var(--studio-border-strong)" }}>
                  {relativeTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ConversationsPanel({
  conversations,
  messages,
  ideaId,
}: {
  conversations: Conversation[];
  messages: Message[];
  ideaId: string;
}) {
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"internal" | "public">("internal");
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(() => crypto.randomUUID());
  // null = live session, string = past conversation id
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Tracks whether the live session has any messages
  const hasMessages = useRef(false);
  useEffect(() => {
    hasMessages.current = liveMessages.length > 0;
  }, [liveMessages]);

  // 2. saveSummary — sendBeacon primary, fetch fallback
  const saveSummary = useCallback(() => {
    const body = JSON.stringify({ conversation_id: conversationId, idea_id: ideaId });
    const sent = navigator.sendBeacon(
      "/api/converse/summarize",
      new Blob([body], { type: "application/json" })
    );
    if (!sent) {
      fetch("/api/converse/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  }, [conversationId, ideaId]);

  // 3a. beforeunload — trigger summary if messages exist
  useEffect(() => {
    const handler = () => {
      if (hasMessages.current) {
        navigator.sendBeacon(
          "/api/converse/summarize",
          new Blob(
            [JSON.stringify({ conversation_id: conversationId, idea_id: ideaId })],
            { type: "application/json" }
          )
        );
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [conversationId, ideaId]);

  // 3b. Inactivity timeout — summarize 60 min after the last "idea" message
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (liveMessages.length === 0) return;
    const last = liveMessages[liveMessages.length - 1];
    if (last.role !== "idea" || last.streaming) return;

    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(saveSummary, 60 * 60 * 1000);

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [liveMessages, saveSummary]);

  // 3c. On-mount backstop — summarize any unsummarized past conversations
  useEffect(() => {
    const messagesByConv: Record<string, Message[]> = {};
    for (const m of messages) {
      if (!m.conversation_id) continue;
      if (!messagesByConv[m.conversation_id]) messagesByConv[m.conversation_id] = [];
      messagesByConv[m.conversation_id].push(m);
    }
    for (const conv of conversations) {
      if (!conv.summary && messagesByConv[conv.id]?.length > 0) {
        fetch("/api/converse/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conv.id, idea_id: ideaId }),
        }).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === null) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveMessages, activeTab]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setActiveTab(null); // switch to live view when sending

    setLiveMessages((prev) => [...prev, { role: "user", content: text }]);

    const history = liveMessages.map((m) => ({
      role: m.role === "idea" ? "assistant" : "user",
      content: m.content,
    }));

    setLiveMessages((prev) => [...prev, { role: "idea", content: "", streaming: true }]);
    setLoading(true);

    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: ideaId,
          message: text,
          history,
          conversation_id: conversationId,
          mode,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      const handleStreamEvent = (eventText: string) => {
        const data = eventText
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("\n");

        if (!data.trim()) return;

        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error);

        if (parsed.text) {
          accumulated += parsed.text;
          setLiveMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "idea",
              content: accumulated,
              streaming: true,
            };
            return updated;
          });
        }

        if (parsed.done) {
          setLiveMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "idea",
              content: accumulated,
              streaming: false,
            };
            return updated;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventText of events) {
          handleStreamEvent(eventText);
        }
      }

      if (buffer.trim()) {
        handleStreamEvent(buffer);
      }
    } catch (err: any) {
      setError(err.message);
      setLiveMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [input, loading, liveMessages, ideaId, conversationId, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Group past messages by conversation
  const byConv = new Map<string, Message[]>();
  for (const msg of messages) {
    if (!msg.conversation_id) continue;
    if (!byConv.has(msg.conversation_id)) byConv.set(msg.conversation_id, []);
    byConv.get(msg.conversation_id)!.push(msg);
  }
  const convMap = new Map(conversations.map((c) => [c.id, c]));
  const pastConvIds = conversations
    .filter((c) => byConv.has(c.id))
    .map((c) => c.id);

  const showingPast = activeTab !== null;
  const pastConv = activeTab ? convMap.get(activeTab) : null;
  const pastMessages = activeTab ? (byConv.get(activeTab) ?? []) : [];

  return (
    <div className="flex gap-0" style={{ minHeight: "520px" }}>

      {/* ── Left: session tabs ──────────────────────────────────────── */}
      {(pastConvIds.length > 0 || liveMessages.length > 0) && (
        <div
          className="flex flex-col gap-1 pr-3 mr-3 shrink-0"
          style={{
            width: "120px",
            borderRight: "1px solid var(--studio-border)",
          }}
        >
          <p
            className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            Sessions
          </p>

          {/* Current session tab */}
          <button
            onClick={() => setActiveTab(null)}
            className="rounded px-2 py-1.5 text-left text-xs transition-colors"
            style={{
              backgroundColor: !showingPast ? "var(--studio-bg-3)" : "transparent",
              color: !showingPast ? "var(--studio-amber)" : "var(--studio-fg-muted)",
              border: `1px solid ${!showingPast ? "var(--studio-amber-dim)" : "transparent"}`,
            }}
          >
            <span className="block text-[10px] uppercase tracking-widest mb-0.5" style={{ opacity: 0.6 }}>
              now
            </span>
            {mode}
          </button>

          {/* Past session tabs */}
          {pastConvIds.map((id) => {
            const conv = convMap.get(id)!;
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="rounded px-2 py-1.5 text-left text-xs transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--studio-bg-3)" : "transparent",
                  color: isActive ? "var(--studio-amber)" : "var(--studio-fg-muted)",
                  border: `1px solid ${isActive ? "var(--studio-amber-dim)" : "transparent"}`,
                }}
              >
                <span className="block text-[10px] uppercase tracking-widest mb-0.5" style={{ opacity: 0.6 }}>
                  {conv.context === "portfolio_public" ? "public" : "internal"}
                </span>
                <span className="block text-[11px] leading-snug mb-0.5">
                  {(() => {
                    const firstUserMsg = (byConv.get(id) ?? []).find((m) => m.role === "user");
                    if (!firstUserMsg) return relativeTime(conv.created_at);
                    const text = firstUserMsg.content.trim();
                    return text.length > 28 ? text.slice(0, 28) + "…" : text;
                  })()}
                </span>
                <span className="block text-[10px]" style={{ opacity: 0.5 }}>
                  {relativeTime(conv.created_at)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Right: content area ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Past session view */}
        {showingPast && pastConv && (
          <div className="flex-1 overflow-y-auto">
            <PastSession conv={pastConv} messages={pastMessages} />
          </div>
        )}

        {/* Live session view */}
        {!showingPast && (
          <>
            {/* Mode toggle */}
            <div className="flex items-center justify-between mb-4">
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--studio-amber-dim)" }}
              >
                {liveMessages.length === 0 ? "New Session" : "Active Session"}
              </p>
              <div
                className="flex overflow-hidden rounded border text-[11px]"
                style={{ borderColor: "var(--studio-border)" }}
              >
                {(["internal", "public"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="px-3 py-1 transition-colors"
                    style={{
                      background: mode === m ? "var(--studio-bg-3)" : "transparent",
                      color: mode === m ? "var(--studio-amber)" : "var(--studio-fg-muted)",
                      borderRight: m === "internal" ? `1px solid var(--studio-border)` : undefined,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages or empty state */}
            <div className="flex-1 overflow-y-auto mb-4">
              {liveMessages.length === 0 ? (
                <p
                  className="text-sm italic"
                  style={{ color: "var(--studio-fg-muted)" }}
                >
                  {mode === "internal"
                    ? "Ask the idea something. It will push back, surface conflicts, and propose extractions."
                    : "Talk to the idea as a visitor. It will represent itself with optimism."}
                </p>
              ) : (
                <div className="space-y-3">
                  {liveMessages.map((msg, i) => {
                    const isUser = msg.role === "user";
                    const [main, extraction] = msg.content.split(/\n(?=PROPOSED EXTRACTION:)/);
                    return (
                      <div key={i}>
                        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className="max-w-[85%] rounded-xl px-4 py-3"
                            style={{
                              backgroundColor: isUser ? "var(--studio-bg-3)" : "var(--studio-bg-2)",
                              border: `1px solid ${isUser ? "var(--studio-border-strong)" : "var(--studio-border)"}`,
                              borderLeft: !isUser ? "2px solid var(--studio-amber-dim)" : undefined,
                            }}
                          >
                            {!isUser && (
                              <p
                                className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                                style={{ color: "var(--studio-amber-dim)" }}
                              >
                                idea
                              </p>
                            )}
                            <p
                              className="text-sm leading-relaxed whitespace-pre-wrap"
                              style={{ color: "var(--studio-fg-muted)" }}
                            >
                              {main}
                              {msg.streaming && (
                                <span
                                  className="ml-0.5 inline-block h-3.5 w-2 rounded-sm align-text-bottom"
                                  style={{
                                    backgroundColor: "var(--studio-amber-dim)",
                                    animation: "blink 0.9s step-end infinite",
                                    opacity: 0.7,
                                  }}
                                />
                              )}
                            </p>
                          </div>
                        </div>
                        {extraction && (
                          <div
                            className="mt-1 max-w-[85%] rounded border p-3"
                            style={{
                              borderColor: "var(--studio-amber-dim)",
                              backgroundColor: "var(--studio-bg-2)",
                              opacity: 0.85,
                            }}
                          >
                            <p
                              className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                              style={{ color: "var(--studio-amber-dim)" }}
                            >
                              proposed extraction
                            </p>
                            <pre
                              className="text-[11px] leading-relaxed whitespace-pre-wrap"
                              style={{
                                color: "var(--studio-fg-muted)",
                                fontFamily: "var(--font-mono, monospace)",
                              }}
                            >
                              {extraction.trim()}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-3 flex items-center justify-between rounded border px-3 py-2 text-xs"
                style={{ borderColor: "var(--studio-border)", color: "var(--studio-fg-muted)" }}
              >
                <span>Error: {error}</span>
                <button
                  onClick={() => setError(null)}
                  style={{ color: "var(--studio-amber-dim)" }}
                >
                  dismiss
                </button>
              </div>
            )}

            {/* Input */}
            <div
              className="flex overflow-hidden rounded-lg border transition-colors focus-within:border-current shrink-0"
              style={{
                borderColor: "var(--studio-border)",
                backgroundColor: "var(--studio-bg-2)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                placeholder={
                  loading
                    ? "thinking..."
                    : "Ask or tell the idea something. Shift+Enter for new line."
                }
                className="flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none"
                style={{ color: "var(--studio-fg)", minHeight: "44px", maxHeight: "160px" }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-4 text-lg transition-colors disabled:opacity-30"
                style={{ color: loading ? "var(--studio-fg-muted)" : "var(--studio-amber)" }}
              >
                {loading ? "···" : "→"}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}