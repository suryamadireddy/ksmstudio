export type RetriageChatMessage = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Synthetic server opener — kept in API history, hidden in the UI. */
  hidden?: boolean;
};

/** Server-side opener used when the client starts a retriage with messages=[]. */
export function buildRetriageSeedMessage(ideaLabel: string): RetriageChatMessage {
  const label = ideaLabel.trim() || "this idea";
  return {
    role: "user",
    content:
      `I want to re-triage this existing idea: "${label}". ` +
      "Here is what I want to revisit or update about it.",
    hidden: true,
  };
}

/**
 * Merge a server-echoed seed into client chat state.
 * Keeps any in-flight streaming assistant placeholder at the end.
 */
export function mergeSeededMessages(
  current: RetriageChatMessage[],
  seeded: Array<{ role: "user" | "assistant"; content: string }>
): RetriageChatMessage[] {
  const seedMsgs: RetriageChatMessage[] = seeded.map((m) => ({
    role: m.role,
    content: m.content,
    hidden: true,
  }));
  const withoutPriorSeed = current.filter((m) => !m.hidden);
  const streaming = withoutPriorSeed.filter((m) => m.streaming);
  const rest = withoutPriorSeed.filter((m) => !m.streaming);
  return [...seedMsgs, ...rest, ...streaming];
}

/** Anthropic Messages API requires a user turn first and strict alternation. */
export function isValidAnthropicMessageOrder(
  messages: Array<{ role: "user" | "assistant" }>
): boolean {
  if (messages.length === 0) return false;
  if (messages[0].role !== "user") return false;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) return false;
  }
  return true;
}
