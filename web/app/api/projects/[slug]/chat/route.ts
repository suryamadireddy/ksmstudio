import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { message, conversationId } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "invalid_message" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  let adminSupabase;
  try {
    adminSupabase = createServiceRoleClient();
  } catch (error) {
    console.error("service role client error:", error);
    return Response.json({ error: "server_not_configured" }, { status: 500 });
  }

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

  let convId = typeof conversationId === "string" ? conversationId : "";
  if (!convId) {
    convId = crypto.randomUUID();
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
  } else {
    const { data: existingConversation, error: convErr } = await adminSupabase
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("idea_id", row.id)
      .eq("context", "portfolio_public")
      .maybeSingle();

    if (convErr) {
      console.error("conversation lookup error:", convErr);
      return Response.json({ error: "db_error" }, { status: 500 });
    }

    if (!existingConversation) {
      return Response.json({ error: "conversation_not_found" }, { status: 404 });
    }
  }

  const { error: msgErr } = await adminSupabase.from("messages").insert({
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

  const { data: history } = await adminSupabase
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
      const { error: replyErr } = await adminSupabase.from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id: convId,
        idea_id: row.id,
        role: "idea",
        content: full,
        created_at: new Date().toISOString(),
      });
      if (replyErr) console.error("assistant message insert error:", replyErr);
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
