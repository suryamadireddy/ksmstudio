import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export interface ConversationTokenPayload {
  conversationId: string;
  ideaId: string;
  slug: string;
}

function getSecret(): string {
  const secret =
    process.env.PORTFOLIO_CHAT_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing portfolio chat token secret");
  }

  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function hasPayloadShape(value: unknown): value is ConversationTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ConversationTokenPayload>;
  return (
    typeof payload.conversationId === "string" &&
    typeof payload.ideaId === "string" &&
    typeof payload.slug === "string"
  );
}

export function signConversationToken(payload: ConversationTokenPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyConversationToken(
  token: string,
): ConversationTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expected = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    return hasPayloadShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
