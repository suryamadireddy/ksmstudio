"use client";

import { useState } from "react";

type Props = {
  slug: string;
};

export function ChatBox({ slug }: Props) {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;

    const userMessage = input;

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${slug}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Chat failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-12 rounded-2xl border p-6">
      <h2 className="text-lg font-semibold mb-4">Ask about this project</h2>

      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i}>
            <p className="text-xs text-gray-500">{m.role}</p>
            <p className="text-sm">{m.content}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={isLoading}
          className="rounded bg-black px-4 py-2 text-white text-sm"
        >
          Send
        </button>
      </div>
    </div>
  );
}
