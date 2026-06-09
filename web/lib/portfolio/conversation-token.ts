import { createHmac, timingSafeEqual } from "node:crypto";

function getConversationTokenSecret() {
  const secret =
    process.env.PORTFOLIO_CHAT_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!secret) {
    throw new Error(
      "Portfolio chat requires PORTFOLIO_CHAT_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return secret;
}

export function signConversationId(conversationId: string) {
  const payload = Buffer.from(
    JSON.stringify({ conversationId, version: 1 }),
  ).toString("base64url");
  const signature = createHmac("sha256", getConversationTokenSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyConversationToken(token: unknown) {
  if (typeof token !== "string") return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getConversationTokenSecret())
    .update(payload)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.conversationId === "string"
      ? parsed.conversationId
      : null;
  } catch {
    return null;
  }
}
