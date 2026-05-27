import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : "";

    if (!message || message.length > 4000) {
      return Response.json({ error: "invalid_message" }, { status: 400 });
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
        "id, raw_input, domain, state, created_at, development, outcomes, portfolio",
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

    const systemPrompt = composeSystemPrompt({
      idea: row,
      chatbotContext: activeVersion.chatbot_context,
      journal: [],
      refinements: [],
      sharedRefusals: SHARED_REFUSALS,
    });

    let convId = conversationId;
    if (convId) {
      const { data: conversation, error: conversationErr } = await supabase
        .from("conversations")
        .select("id, idea_id, context")
        .eq("id", convId)
        .single();

      if (
        conversationErr ||
        !conversation ||
        conversation.idea_id !== row.id ||
        conversation.context !== "portfolio_public"
      ) {
        return Response.json({ error: "invalid_conversation" }, { status: 400 });
      }
    } else {
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
    if (msgErr) {
      console.error("user message insert error:", msgErr);
      return Response.json({ error: "db_error" }, { status: 500 });
    }

    const { data: history, error: historyErr } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .eq("idea_id", row.id)
      .order("created_at");
    if (historyErr) {
      console.error("message history error:", historyErr);
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
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              full += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const { error: assistantMsgErr } = await supabase.from("messages").insert({
            id: crypto.randomUUID(),
            conversation_id: convId,
            idea_id: row.id,
            role: "idea",
            content: full,
            created_at: new Date().toISOString(),
          });
          if (assistantMsgErr) {
            console.error("assistant message insert error:", assistantMsgErr);
          }
        } catch (error) {
          console.error("portfolio chat stream error:", error);
          controller.enqueue(
            encoder.encode("Something went wrong. Please try again.")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "x-conversation-id": convId,
      },
    });
  } catch (error) {
    console.error("portfolio chat error:", error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
