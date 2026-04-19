"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Role = "user" | "assistant";
interface ChatMessage {
  role: Role;
  content: string;
  streaming?: boolean;
}

interface TriageSummary {
  title: string;
  effort_score: number;
  impact_score: number;
  confidence: number;
  disposition: string;
  triage_reasoning: string;
  who_benefits: string;
  kill_assumptions: Array<{ text: string; status: string } | string>;
}

const DISPOSITION_STYLE: Record<string, { label: string; color: string }> = {
  pursue:    { label: "Pursue",    color: "var(--studio-amber)" },
  potential: { label: "Potential", color: "#6ee7b7" },
  park:      { label: "Park",      color: "var(--studio-fg-muted)" },
  discard:   { label: "Discard",   color: "#f87171" },
};

export default function RetrtagePage() {
  const params = useParams();
  const ideaId = params.id as string;
  const router = useRouter();

  const [phase, setPhase] = useState<"chat" | "done">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triage, setTriage] = useState<TriageSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── SSE stream helper ───────────────────────────────────────────────────────

  async function streamRetriage(
    msgs: Array<{ role: "user" | "assistant"; content: string }>
  ) {
    setLoading(true);
    setError(null);

    const placeholder: ChatMessage = { role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, placeholder]);

    try {
      const res = await fetch("/api/triage/retrigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: ideaId, messages: msgs }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "Request failed");
        throw new Error(text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;

            if (evt.error) {
              throw new Error(String(evt.error));
            }

            if (evt.text) {
              accText += evt.text as string;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: accText,
                  streaming: true,
                };
                return next;
              });
            }

            if (evt.done && evt.idea_id) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: accText,
                  streaming: false,
                };
                return next;
              });
              setTriage((evt.triage ?? null) as TriageSummary | null);
              setPhase("done");
            } else if (evt.turn_done) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: accText,
                  streaming: false,
                };
                return next;
              });
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !m.streaming));
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // Auto-seed opener on mount
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    streamRetriage([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages.filter((m) => !m.streaming), userMsg];
    setMessages(nextMessages);

    await streamRetriage(
      nextMessages.map((m) => ({ role: m.role, content: m.content }))
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Done state ──────────────────────────────────────────────────────────────

  if (phase === "done") {
    const disp = triage?.disposition ?? "park";
    const dispStyle = DISPOSITION_STYLE[disp] ?? DISPOSITION_STYLE.park;

    return (
      <div className="mx-auto max-w-xl pt-10">
        <div className="mb-6">
          <Link
            href={`/studio/ideas/${ideaId}`}
            className="mb-4 inline-flex items-center gap-1 text-xs transition-colors"
            style={{ color: "var(--studio-fg-muted)" }}
          >
            ← Back to idea
          </Link>
          <h1
            className="text-2xl font-normal"
            style={{
              fontFamily: "var(--font-playfair, Georgia, serif)",
              color: "var(--studio-fg)",
            }}
          >
            Re-triage complete
          </h1>
        </div>

        {triage && (
          <div
            className="mb-6 rounded-lg border p-5"
            style={{ borderColor: "var(--studio-border)" }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <p
                className="text-base font-medium leading-snug"
                style={{ color: "var(--studio-fg)" }}
              >
                {triage.title}
              </p>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: `color-mix(in srgb, ${dispStyle.color} 15%, transparent)`,
                  color: dispStyle.color,
                  border: `1px solid color-mix(in srgb, ${dispStyle.color} 30%, transparent)`,
                }}
              >
                {dispStyle.label}
              </span>
            </div>

            <div className="mb-4 flex gap-6">
              {[
                { label: "Effort",     value: triage.effort_score },
                { label: "Impact",     value: triage.impact_score },
                { label: "Confidence", value: triage.confidence },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p
                    className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--studio-amber-dim)" }}
                  >
                    {label}
                  </p>
                  <p className="text-lg font-medium" style={{ color: "var(--studio-fg)" }}>
                    {value}
                    <span className="text-xs" style={{ color: "var(--studio-fg-muted)" }}>/5</span>
                  </p>
                </div>
              ))}
            </div>

            {triage.triage_reasoning && (
              <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--studio-fg-muted)" }}>
                {triage.triage_reasoning}
              </p>
            )}

            {triage.kill_assumptions?.length > 0 && (
              <div>
                <p
                  className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--studio-amber-dim)" }}
                >
                  Kill assumptions
                </p>
                <ul className="space-y-1">
                  {triage.kill_assumptions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-xs" style={{ color: "var(--studio-fg-muted)" }}>
                      <span
                        className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: "var(--studio-amber-dim)" }}
                      />
                      {typeof a === "object" ? a.text : a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push(`/studio/ideas/${ideaId}`)}
            className="w-full rounded px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--studio-amber)",
              color: "var(--studio-bg)",
            }}
          >
            View updated idea →
          </button>
        </div>
      </div>
    );
  }

  // ── Chat state ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-0 py-3"
        style={{ borderColor: "var(--studio-border)" }}
      >
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--studio-amber-dim)" }}
          >
            Re-triage interview
          </p>
          <p className="mt-0.5 text-sm" style={{ color: "var(--studio-fg)" }}>
            Revisiting an existing idea
          </p>
        </div>
        <Link
          href={`/studio/ideas/${ideaId}`}
          className="text-xs transition-colors"
          style={{ color: "var(--studio-fg-muted)" }}
        >
          Cancel
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed"
                style={
                  msg.role === "user"
                    ? {
                        backgroundColor: "var(--studio-amber)",
                        color: "var(--studio-bg)",
                      }
                    : {
                        border: "1px solid var(--studio-border)",
                        backgroundColor: "var(--studio-surface, var(--studio-bg))",
                        color: "var(--studio-fg)",
                      }
                }
              >
                <p className="whitespace-pre-wrap">
                  {msg.content}
                  {msg.streaming && (
                    <span
                      className="ml-1 inline-block h-3 w-0.5 animate-pulse"
                      style={{ backgroundColor: "var(--studio-fg-muted)" }}
                    />
                  )}
                </p>
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div
                className="rounded-xl border px-4 py-3"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-surface, var(--studio-bg))",
                }}
              >
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full"
                      style={{
                        backgroundColor: "var(--studio-fg-muted)",
                        animationDelay: `${delay}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                borderColor: "rgba(248,113,113,0.3)",
                backgroundColor: "rgba(248,113,113,0.05)",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div
        className="border-t py-4"
        style={{ borderColor: "var(--studio-border)" }}
      >
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply…"
            className="flex-1 resize-none rounded-lg border px-4 py-3 text-sm focus:outline-none"
            style={{
              borderColor: "var(--studio-border)",
              backgroundColor: "var(--studio-surface, var(--studio-bg))",
              color: "var(--studio-fg)",
              maxHeight: "120px",
              overflowY: "auto",
            }}
            rows={1}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--studio-amber)",
              color: "var(--studio-bg)",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
