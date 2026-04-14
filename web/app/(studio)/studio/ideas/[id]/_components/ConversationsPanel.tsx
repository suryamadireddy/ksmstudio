import type { Conversation, Message } from "@/lib/types";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  return `${Math.floor(diff / d)}d ago`;
}

export default function ConversationsPanel({
  conversations,
  messages,
}: {
  conversations: Conversation[];
  messages: Message[];
}) {
  if (!messages.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--studio-fg-muted)" }}>
        No conversation history yet.
      </p>
    );
  }

  // Group messages by conversation_id
  const byConv = new Map<string | null, Message[]>();
  for (const msg of messages) {
    const key = msg.conversation_id ?? null;
    if (!byConv.has(key)) byConv.set(key, []);
    byConv.get(key)!.push(msg);
  }

  const convMap = new Map(conversations.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {Array.from(byConv.entries()).map(([convId, msgs]) => {
        const conv = convId ? convMap.get(convId) : null;
        return (
          <div key={convId ?? "orphan"}>
            {conv && (
              <div
                className="mb-4 flex items-center justify-between border-b pb-3"
                style={{ borderColor: "var(--studio-border)" }}
              >
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest"
                  style={{
                    backgroundColor: "var(--studio-bg-3)",
                    color: "var(--studio-amber-dim)",
                  }}
                >
                  {conv.context ?? "Session"}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--studio-fg-muted)" }}
                >
                  {relativeTime(conv.created_at)}
                </span>
              </div>
            )}

            <div className="space-y-3">
              {msgs.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[80%] rounded-xl px-4 py-3"
                      style={{
                        backgroundColor: isUser
                          ? "var(--studio-bg-3)"
                          : "var(--studio-bg-2)",
                        border: `1px solid ${isUser ? "var(--studio-border-strong)" : "var(--studio-border)"}`,
                      }}
                    >
                      {!isUser && (
                        <p
                          className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color: "var(--studio-amber-dim)" }}
                        >
                          {msg.role === "idea" ? "Idea" : "Assistant"}
                        </p>
                      )}
                      <p
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: "var(--studio-fg-muted)" }}
                      >
                        {msg.content}
                      </p>
                      <p
                        className="mt-1.5 text-[10px]"
                        style={{ color: "var(--studio-border-strong)" }}
                      >
                        {relativeTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {conv?.summary && (
              <div
                className="mt-4 rounded-lg border p-4"
                style={{
                  borderColor: "var(--studio-border)",
                  backgroundColor: "var(--studio-bg-2)",
                }}
              >
                <p
                  className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
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
          </div>
        );
      })}
    </div>
  );
}
