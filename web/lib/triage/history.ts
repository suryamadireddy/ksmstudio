/**
 * Helpers for studio triage / retriage chat history.
 *
 * The SSE clients used to:
 * 1. Leave `streaming: true` placeholders in history when the stream ended
 *    without turn_done/done/error (proxy timeout, deploy cut, dropped socket).
 * 2. Commit assistant turns with empty content when turn_done fired with no
 *    text_delta (adaptive thinking can exhaust max_tokens without text).
 *
 * On the next Send, `filter(!streaming)` dropped the incomplete assistant and
 * posted consecutive user turns — or posted `content: ""` — both of which
 * Anthropic rejects with HTTP 400, permanently sticking the interview.
 */

export type TriageChatRole = "user" | "assistant";

export interface TriageChatMessage {
  role: TriageChatRole;
  content: string;
  streaming?: boolean;
}

/** Drop incomplete streaming placeholders after an interrupted SSE stream. */
export function dropStreamingPlaceholders<T extends TriageChatMessage>(
  messages: T[],
): T[] {
  return messages.filter((m) => !m.streaming);
}

/**
 * Build the next outbound history when the user sends a reply:
 * - drop streaming placeholders
 * - drop empty/whitespace-only assistant turns (invalid for Anthropic)
 * - append the new user message
 */
export function buildNextUserTurn<T extends TriageChatMessage>(
  messages: T[],
  userText: string,
): Array<{ role: TriageChatRole; content: string }> {
  const cleaned: Array<{ role: TriageChatRole; content: string }> = [];
  for (const m of messages) {
    if (m.streaming) continue;
    const content = typeof m.content === "string" ? m.content : "";
    if (m.role === "assistant" && !content.trim()) continue;
    cleaned.push({ role: m.role, content });
  }
  cleaned.push({ role: "user", content: userText });
  return cleaned;
}

/**
 * Server-side guard: keep only non-empty alternating turns ending in user.
 * Returns null when the history cannot be made valid.
 */
export function sanitizeMessagesForAnthropic(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: TriageChatRole; content: string }> | null {
  const normalized: Array<{ role: TriageChatRole; content: string }> = [];

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    const role = m.role as TriageChatRole;
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      // Merge consecutive same-role turns rather than failing hard on
      // slightly-desynced clients that already recovered mid-session.
      prev.content = `${prev.content}\n\n${m.content}`;
      continue;
    }
    normalized.push({ role, content: m.content });
  }

  if (normalized.length === 0) return null;
  if (normalized[0].role !== "user") return null;
  if (normalized[normalized.length - 1].role !== "user") return null;
  return normalized;
}
