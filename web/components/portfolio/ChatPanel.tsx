"use client";

import { useRef, useState } from "react";
import type { ChatbotContext } from "@/lib/types";

interface Message {
  role: "user" | "idea";
  content: string;
}

export function ChatPanel({
  ideaId,
  slug,
  chatbotContext,
}: {
  ideaId: string;
  slug: string;
  chatbotContext?: Partial<ChatbotContext> | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const identityStatement = chatbotContext?.identity_statement?.trim() || "this idea";
  const promptSuggestions = Array.isArray(chatbotContext?.open_curiosities)
    ? chatbotContext.open_curiosities
    : [];
  const shortIdentity = identityStatement.split(" ").slice(0, 3).join(" ");

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`/api/projects/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId }),
      });

      const newConvId = res.headers.get("x-conversation-id");
      if (newConvId && !convId) setConvId(newConvId);

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      setMessages((prev) => [...prev, { role: "idea", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "idea", content: full };
          return next;
        });
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "idea", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setOpen(true)}
          className="rounded-full px-5 py-3 text-sm font-medium shadow-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
        >
          Ask {shortIdentity}…
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex w-80 flex-col rounded-xl shadow-2xl md:w-96"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", maxHeight: "70vh" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
          Talk to the idea
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs italic" style={{ color: "var(--muted)" }}>
            {promptSuggestions[0] ?? "Ask me anything."}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
              style={
                msg.role === "user"
                  ? { backgroundColor: "var(--accent)", color: "var(--bg)" }
                  : { backgroundColor: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)" }
              }
            >
              {msg.content || (loading && msg.role === "idea" ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg)",
              color: "var(--fg)",
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
