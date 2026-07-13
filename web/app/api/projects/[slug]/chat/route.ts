import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

interface ConversationTokenPayload {
  conversationId: string;
  ideaId: string;
  slug: string;
  issuedAt: number;
}

function getTokenSecret() {
  const secret =
    process.env.PORTFOLIO_CHAT_TOKEN_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing portfolio chat token secret");
  return secret;
}

function signConversationToken(payload: ConversationTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyConversationToken(
  token: unknown,
  expected: { ideaId: string; slug: string },
) {
  if (typeof token !== "string") return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expectedSignature = createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ConversationTokenPayload>;

    if (
      typeof payload.conversationId !== "string" ||
      payload.ideaId !== expected.ideaId ||
      payload.slug !== expected.slug
    ) {
      return null;
    }

    return payload.conversationId;
  } catch {
    return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { message, conversationToken } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = createServiceRoleClient();
  const { data: row } = await supabase
    .from("ideas")
    .select(
      "id, raw_input, domain, state, created_at, triage, development, outcomes, portfolio",
    )
    .eq("published", true)
    .filter("portfolio->>slug", "eq", slug)
    .single();

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeVersion = (row.portfolio as any)?.versions?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => v.id === (row.portfolio as any).active_version_id,
  );
  if (!activeVersion) {
    return Response.json({ error: "no_active_version" }, { status: 500 });
  }

  const [journalRes, refinementsRes] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("*")
      .eq("idea_id", row.id)
      .order("created_at"),
    supabase
      .from("refinements")
      .select("*")
      .eq("idea_id", row.id)
      .order("created_at"),
  ]);

  const systemPrompt = composeSystemPrompt({
    idea: row,
    chatbotContext: activeVersion.chatbot_context,
    journal: journalRes.data ?? [],
    refinements: refinementsRes.data ?? [],
    sharedRefusals: SHARED_REFUSALS,
  });

  let convId = verifyConversationToken(conversationToken, {
    ideaId: row.id,
    slug,
  });
  let responseConversationToken =
    convId === null
      ? null
      : signConversationToken({
          conversationId: convId,
          ideaId: row.id,
          slug,
          issuedAt: Date.now(),
        });

  if (conversationToken && !convId) {
    return Response.json({ error: "invalid_conversation" }, { status: 401 });
  }

  if (!convId) {
    convId = crypto.randomUUID();
    const { error: convErr } = await supabase.from("conversations").insert({
      id: convId,
      idea_id: row.id,
      context: "portfolio_public",
      created_at: new Date().toISOString(),
    });
    if (convErr) {
      console.error("conversation insert error:", convErr);
      return Response.json({ error: "db_error" }, { status: 500 });
    }
    responseConversationToken = signConversationToken({
      conversationId: convId,
      ideaId: row.id,
      slug,
      issuedAt: Date.now(),
    });
  } else {
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("idea_id", row.id)
      .eq("context", "portfolio_public")
      .single();

    if (!existingConversation) {
      return Response.json({ error: "invalid_conversation" }, { status: 401 });
    }
  }

  const { error: msgErr } = await supabase.from("messages").insert({
    id: crypto.randomUUID(),
    conversation_id: convId,
    idea_id: row.id,
    role: "user",
    content: message,
    created_at: new Date().toISOString(),
  });
  if (msgErr) console.error("user message insert error:", msgErr);

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .eq("idea_id", row.id)
    .order("created_at");

  const anthropic = new Anthropic();
  const stream = await anthropic.messages.create({
    model: CONVERSE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: (history ?? []).map((m) => ({
      role: m.role === "idea" ? "assistant" : (m.role as "user" | "assistant"),
      content: m.content,
    })),
    stream: true,
  });

  let full = "";
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          full += event.delta.text;
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      await supabase.from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id: convId,
        idea_id: row.id,
        role: "idea",
        content: full,
        created_at: new Date().toISOString(),
      });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "x-conversation-token": responseConversationToken ?? "",
    },
  });
}
