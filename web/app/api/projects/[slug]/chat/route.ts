import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composePublicSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
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

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("ideas")
    .select("id, portfolio")
    .eq("published", true)
    .filter("portfolio->>slug", "eq", slug)
    .single();

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeVersion = (row.portfolio as any)?.versions?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => v.id === (row.portfolio as any).active_version_id && v.status === "active",
  );
  if (!activeVersion) {
    return Response.json({ error: "no_active_version" }, { status: 500 });
  }

  const systemPrompt = composePublicSystemPrompt({
    chatbotContext: activeVersion.chatbot_context,
    sharedRefusals: SHARED_REFUSALS,
  });

  let convId = "";
  if (conversationId) {
    if (typeof conversationId !== "string") {
      return Response.json({ error: "invalid_conversation" }, { status: 400 });
    }
    const { data: existingConversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, idea_id, context")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      console.error("conversation lookup error:", conversationError);
      return Response.json({ error: "db_error" }, { status: 500 });
    }

    if (
      !existingConversation ||
      existingConversation.idea_id !== row.id ||
      existingConversation.context !== "portfolio_public"
    ) {
      return Response.json({ error: "invalid_conversation" }, { status: 400 });
    }

    convId = existingConversation.id;
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
  }

  const { error: msgErr } = await supabase.from("messages").insert({
    id: crypto.randomUUID(),
    conversation_id: convId,
    idea_id: row.id,
    role: "user",
    content: message.trim(),
    created_at: new Date().toISOString(),
  });
  if (msgErr) {
    console.error("user message insert error:", msgErr);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", convId)
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
      "x-conversation-id": convId,
    },
  });
}
