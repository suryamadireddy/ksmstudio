"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Conversation, Message } from "@/lib/types";

// ── Triage insight types + card ───────────────────────────────────────────────

interface TriageInsight {
  whatChanged: string;
  dimensionsAffected: string;
  previousUnderstanding: string | null;
  newSignal: string | null;
  recommendedAction: "retriage" | "update_assumption" | "note_only";
  assumptionText: string | null;
  assumptionStatus: string | null;
}

function TriageInsightCard({
  insight,
  ideaId,
}: {
  insight: TriageInsight;
  ideaId: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="mt-2 max-w-[85%] rounded border p-3"
      style={{
        borderColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.5)",
        backgroundColor: "rgba(var(--studio-amber-rgb, 180,120,40), 0.06)",
      }}
    >
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber)" }}
      >
        ⚡ triage insight
      </p>

      <p className="mb-1 text-[11px] font-medium" style={{ color: "var(--studio-fg)" }}>
        {insight.whatChanged}
      </p>

      <div className="mb-2 space-y-0.5 text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
        {insight.dimensionsAffected && (
          <p>Affects: <span style={{ color: "var(--studio-amber-dim)" }}>{insight.dimensionsAffected}</span></p>
        )}
        {insight.previousUnderstanding && <p>Was: {insight.previousUnderstanding}</p>}
        {insight.newSignal && <p>Now: {insight.newSignal}</p>}
        {insight.assumptionText && (
          <p>
            Assumption: {insight.assumptionText}
            {insight.assumptionStatus && (
              <span
                className="ml-1 font-semibold"
                style={{
                  color: insight.assumptionStatus === "invalidated" ? "#f87171"
                    : insight.assumptionStatus === "weakened" ? "#f0b429"
                    : "#4ade80",
                }}
              >
                → {insight.assumptionStatus}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {insight.recommendedAction === "retriage" && (
          <Link
            href={`/studio/ideas/${ideaId}/retriage`}
            className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{ backgroundColor: "var(--studio-amber)", color: "var(--studio-bg)" }}
          >
            Re-triage now →
          </Link>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="rounded px-2.5 py-1 text-[11px] transition-colors"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Extraction helpers ────────────────────────────────────────────────────────

interface ParsedExtraction {
  type: string;
  content: string;
  isRefinement: boolean;
  artifact: string | null;
  field: string | null;
  change: string | null;
}

function parseExtraction(raw: string): ParsedExtraction {
  const line = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)`, "im"));
    return m ? m[1].trim() : null;
  };
  const refinementAnswer = line("Should this become a refinement");
  return {
    type: line("Type") ?? "observation",
    content: line("Content") ?? raw.trim(),
    isRefinement: /yes/i.test(refinementAnswer ?? ""),
    artifact: line("Artifact"),
    field: line("Field"),
    change: line("Change"),
  };
}

// ── ExtractionBlock component ─────────────────────────────────────────────────

type BlockState = "default" | "saved" | "dismissed";

function ExtractionBlock({
  extraction,
  ideaId,
}: {
  extraction: string;
  ideaId: string;
  messageIndex: number;
}) {
  const parsed = parseExtraction(extraction);
  const [state, setState] = useState<BlockState>("default");
  const [saving, setSaving] = useState(false);
  const [savedAsRefinement, setSavedAsRefinement] = useState(false);

  // Editable refinement fields (pre-filled from parsed)
  const [artifact, setArtifact] = useState(parsed.artifact ?? "");
  const [fieldPath, setFieldPath] = useState(parsed.field ?? "");
  const [change, setChange] = useState(parsed.change ?? "");

  if (state === "dismissed") return null;

  async function handleSave() {
    setSaving(true);
    try {
      const isRef = parsed.isRefinement && artifact && fieldPath && change;
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: ideaId,
          type: parsed.type,
          content: parsed.content,
          is_refinement: !!isRef,
          artifact: isRef ? artifact : null,
          field_path: isRef ? fieldPath : null,
          change: isRef ? change : null,
        }),
      });
      const data = await res.json() as { ok?: boolean; refinement_id?: string };
      if (data.ok) {
        setSavedAsRefinement(!!data.refinement_id);
        setState("saved");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Saved state ──────────────────────────────────────────────────────────────
  if (state === "saved") {
    return (
      <div
        className="mt-1 max-w-[85%] flex items-center gap-2 rounded border px-3 py-2"
        style={{
          borderColor: "var(--studio-border)",
          backgroundColor: "var(--studio-bg-2)",
        }}
      >
        <span style={{ color: "var(--studio-amber-dim)" }}>✓</span>
        <span className="text-[11px]" style={{ color: "var(--studio-fg-muted)" }}>
          {savedAsRefinement ? "Saved to journal + refinement" : "Saved to journal"}
        </span>
      </div>
    );
  }

  // ── Default state ─────────────────────────────────────────────────────────────
  return (
    <div
      className="mt-1 max-w-[85%] rounded border p-3"
      style={{
        borderColor: "var(--studio-amber-dim)",
        backgroundColor: "var(--studio-bg-2)",
      }}
    >
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--studio-amber-dim)" }}
      >
        proposed extraction · {parsed.type}
      </p>

      <p
        className="mb-3 text-[11px] leading-relaxed"
        style={{ color: "var(--studio-fg-muted)" }}
      >
        {parsed.content}
      </p>

      {/* Editable refinement fields — shown only when Claude flagged it */}
      {parsed.isRefinement && (
        <div
          className="mb-3 space-y-1.5 rounded border p-2"
          style={{ borderColor: "var(--studio-border)" }}
        >
          <p
            className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-amber-dim)" }}
          >
            refinement target
          </p>
          {[
            { label: "Artifact", value: artifact, set: setArtifact },
            { label: "Field", value: fieldPath, set: setFieldPath },
            { label: "Change", value: change, set: setChange },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-12 shrink-0 text-[10px]"
                style={{ color: "var(--studio-fg-muted)", opacity: 0.6 }}
              >
                {label}
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="flex-1 rounded border bg-transparent px-2 py-0.5 text-[11px] outline-none"
                style={{
                  borderColor: "var(--studio-border)",
                  color: "var(--studio-fg)",
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40"
          style={{
            backgroundColor: "var(--studio-amber)",
            color: "var(--studio-bg)",
          }}
        >
          {saving ? "Saving…" : "Save to journal"}
        </button>
        <button
          onClick={() => setState("dismissed")}
          className="rounded px-2.5 py-1 text-[11px] transition-colors"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

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
  insight?: TriageInsight;
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
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
            if (parsed.triage_insight) {
              const insightData = parsed.triage_insight as TriageInsight;
              setLiveMessages((prev) => {
                const updated = [...prev];
                const lastIdeaIdx = updated.map((m, i) => m.role === "idea" ? i : -1).filter((i) => i >= 0).pop();
                if (lastIdeaIdx !== undefined) {
                  updated[lastIdeaIdx] = { ...updated[lastIdeaIdx], insight: insightData };
                }
                return updated;
              });
            }
            if (parsed.done) {
              setLiveMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: accumulated,
                  streaming: false,
                };
                return updated;
              });
              // Save idea response now that stream is complete
              fetch("/api/converse/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  conversation_id: conversationId,
                  idea_id: ideaId,
                  content: accumulated,
                }),
              });
            }
            if (parsed.error) throw new Error(parsed.error);
          } catch { /* skip malformed lines */ }
        }
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
                        {extraction && !msg.streaming && (
                          <ExtractionBlock
                            extraction={extraction.trim()}
                            ideaId={ideaId}
                            messageIndex={i}
                          />
                        )}
                        {msg.insight && !msg.streaming && (
                          <TriageInsightCard insight={msg.insight} ideaId={ideaId} />
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