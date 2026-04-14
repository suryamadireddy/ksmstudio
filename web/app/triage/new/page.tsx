"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Role = "user" | "assistant";
interface ChatMessage {
  role: Role;
  content: string;
}

const OPENING_PROMPT =
  "Tell me the idea. One sentence is fine — I'll dig into it from there.";

export default function TriagePage() {
  const router = useRouter();
  const [rawIdea, setRawIdea] = useState("");
  const [ideaLocked, setIdeaLocked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneIdeaId, setDoneIdeaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Start the interview once idea is locked
  async function startInterview(idea: string) {
    setIdeaLocked(true);
    const firstUserMessage: ChatMessage = { role: "user", content: idea };
    const initialMessages = [firstUserMessage];
    setMessages(initialMessages);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea: idea, messages: initialMessages }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }

      const data = await res.json() as { text?: string; done?: boolean; ideaId?: string };

      if (data.done && data.ideaId) {
        setDone(true);
        setDoneIdeaId(data.ideaId);
      } else if (data.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.text! }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea, messages: nextMessages }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }

      const data = await res.json() as { text?: string; done?: boolean; ideaId?: string };

      if (data.done && data.ideaId) {
        setDone(true);
        setDoneIdeaId(data.ideaId);
      } else if (data.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.text! }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (ideaLocked) {
        sendMessage();
      } else {
        handleIdeaSubmit();
      }
    }
  }

  function handleIdeaSubmit() {
    const trimmed = rawIdea.trim();
    if (!trimmed) return;
    startInterview(trimmed);
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (done && doneIdeaId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-900">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Triage complete</h2>
          <p className="mb-6 text-sm text-gray-500">
            Your idea has been scored and saved.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push(`/ideas/${doneIdeaId}`)}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              View idea →
            </button>
            <Link
              href="/ideas"
              className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Idea entry state ────────────────────────────────────────────────────────
  if (!ideaLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg">
          <div className="mb-6">
            <Link href="/ideas" className="text-xs text-gray-400 hover:text-gray-600">
              ← Dashboard
            </Link>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">New triage</h1>
          <p className="mb-6 text-sm text-gray-500">
            {OPENING_PROMPT}
          </p>
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={rawIdea}
            onChange={(e) => setRawIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleIdeaSubmit();
              }
            }}
            placeholder="e.g. An app that helps freelancers track client feedback across projects"
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            rows={4}
            autoFocus
          />
          <button
            onClick={handleIdeaSubmit}
            disabled={!rawIdea.trim()}
            className="mt-3 w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start interview →
          </button>
        </div>
      </div>
    );
  }

  // ── Chat state ──────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Triage interview</p>
            <p className="mt-0.5 max-w-sm truncate text-sm font-medium text-gray-900">{rawIdea}</p>
          </div>
          <Link href="/ideas" className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={[
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-800",
                ].join(" ")}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
            rows={1}
            style={{ maxHeight: "120px", overflowY: "auto" }}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
