import { Anthropic } from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { CONVERSE_MODEL } from "@/lib/models";
import {
  signConversationId,
  verifyConversationToken,
} from "@/lib/portfolio/conversation-token";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { message, conversationId } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }
  const userMessage = message.trim();

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("ideas")
    .select(
      "id, raw_input, domain, state, created_at, triage, development, outcomes, portfolio",
    )
    .eq("published", true)
    .filter("portfolio->>slug", "eq", slug)
    .single();

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  const adminSupabase = createAdminClient();

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

  let convId = verifyConversationToken(conversationId);
  if (convId) {
    const { data: existingConversation, error: convLookupErr } =
      await adminSupabase
        .from("conversations")
        .select("id")
        .eq("id", convId)
        .eq("idea_id", row.id)
        .eq("context", "portfolio_public")
        .maybeSingle();

    if (convLookupErr) {
      console.error("conversation lookup error:", convLookupErr);
      return Response.json({ error: "db_error" }, { status: 500 });
    }

    if (!existingConversation) convId = null;
  }

  if (!convId) {
    convId = randomUUID();
    const { error: convErr } = await adminSupabase.from("conversations").insert({
      id: convId,
      idea_id: row.id,
      context: "portfolio_public",
      created_at: new Date().toISOString(),
    });
    if (convErr) {
      console.error("conversation insert error:", convErr);
      return Response.json({ error: "db_error" }, { status: 500 });
    }
  }
  const conversationIdForRequest = convId;

  const { error: msgErr } = await adminSupabase.from("messages").insert({
    id: randomUUID(),
    conversation_id: conversationIdForRequest,
    idea_id: row.id,
    role: "user",
    content: userMessage,
    created_at: new Date().toISOString(),
  });
  if (msgErr) {
    console.error("user message insert error:", msgErr);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const { data: history, error: historyErr } = await adminSupabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationIdForRequest)
    .eq("idea_id", row.id)
    .order("created_at");
  if (historyErr) {
    console.error("history lookup error:", historyErr);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

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
      const { error: assistantMsgErr } = await adminSupabase.from("messages").insert({
        id: randomUUID(),
        conversation_id: conversationIdForRequest,
        idea_id: row.id,
        role: "idea",
        content: full,
        created_at: new Date().toISOString(),
      });
      if (assistantMsgErr) {
        console.error("assistant message insert error:", assistantMsgErr);
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "x-conversation-id": signConversationId(conversationIdForRequest),
    },
  });
}
