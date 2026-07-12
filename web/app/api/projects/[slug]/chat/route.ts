import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";
import { getRenderableActiveVersion } from "@/lib/portfolio/version-validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { message, conversationId } = await req.json();

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

  const activeVersion = getRenderableActiveVersion(row.portfolio);
  if (!activeVersion) {
    return Response.json({ error: "no_active_version" }, { status: 409 });
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

  let convId: string = conversationId ?? "";
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
    content: message,
    created_at: new Date().toISOString(),
  });
  if (msgErr) console.error("user message insert error:", msgErr);

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
