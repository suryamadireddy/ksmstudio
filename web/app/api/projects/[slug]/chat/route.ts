import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { SHARED_REFUSALS } from "@/lib/portfolio/refusals";
import { composeSystemPrompt } from "@/lib/portfolio/compose-system-prompt";
import { toPublicIdea } from "@/lib/portfolio/public-projection";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/portfolio/rate-limit";

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
  // Deny-by-default: read the public-safe view, which exposes ONLY
  // id, domain, state, created_at, portfolio (already filtered to published
  // rows). No triage / development / outcomes / raw_input is reachable here, so
  // the public agent can never receive internal data.
  const { data: row } = await supabase
    .from("ideas_public")
    .select("id, domain, state, created_at, portfolio")
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
    publicIdea: toPublicIdea(row, activeVersion),
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
  } else {
    const { data: existingConv, error: existingConvErr } = await supabase
      .from("conversations")
      .select("id, idea_id, context")
      .eq("id", convId)
      .single();
    if (
      existingConvErr ||
      !existingConv ||
      existingConv.idea_id !== row.id ||
      existingConv.context !== "portfolio_public"
    ) {
      return Response.json({ error: "invalid_conversation" }, { status: 400 });
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
