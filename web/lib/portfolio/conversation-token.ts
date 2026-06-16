import { createHmac, timingSafeEqual } from "crypto";

interface TokenInput {
  conversationId: string;
  ideaId: string;
  slug: string;
}

function getTokenSecret() {
  const secret =
    process.env.PORTFOLIO_CHAT_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "PORTFOLIO_CHAT_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY is required",
    );
  }

  return secret;
}

function payload({ conversationId, ideaId, slug }: TokenInput) {
  return `${ideaId}:${slug}:${conversationId}`;
}

function signature(input: TokenInput) {
  return createHmac("sha256", getTokenSecret())
    .update(payload(input))
    .digest("base64url");
}

export function signPortfolioConversationToken(input: TokenInput) {
  return `v1.${signature(input)}`;
}

export function verifyPortfolioConversationToken(
  input: TokenInput & { token?: string | null },
) {
  if (!input.token?.startsWith("v1.")) return false;

  const actual = Buffer.from(input.token.slice(3), "base64url");
  const expected = Buffer.from(signature(input), "base64url");

  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
