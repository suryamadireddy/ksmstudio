import type { Portfolio, PortfolioVersion } from "@/lib/types";

interface PortfolioConversation {
  idea_id: string | null;
  context: string | null;
}

export function getPublicChatVersion(
  portfolio: Pick<Portfolio, "active_version_id" | "versions"> | null | undefined,
): PortfolioVersion | null {
  if (!portfolio?.active_version_id || !Array.isArray(portfolio.versions)) {
    return null;
  }

  return (
    portfolio.versions.find(
      (version) =>
        version.id === portfolio.active_version_id &&
        version.status === "active" &&
        Boolean(version.chatbot_context),
    ) ?? null
  );
}

export function isPortfolioPublicConversationForIdea(
  conversation: PortfolioConversation | null | undefined,
  ideaId: string,
): boolean {
  return (
    conversation?.idea_id === ideaId &&
    conversation.context === "portfolio_public"
  );
}
