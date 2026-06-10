import { loadAuthorizedPortfolio } from "@/lib/portfolio/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  const { supabase } = gate;
  const { data: convRows, error: convErr } = await supabase
    .from("conversations")
    .select("id, created_at")
    .eq("idea_id", ideaId)
    .eq("context", "workspace_edit")
    .order("created_at", { ascending: false })
    .limit(1);
  if (convErr) {
    return Response.json({ error: "history_load_failed" }, { status: 500 });
  }

  const conv = convRows?.[0];
  if (!conv) {
    return Response.json({ conversationId: null, messages: [] });
  }

  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("id, role, content, extracted, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });
  if (msgErr) {
    return Response.json({ error: "history_load_failed" }, { status: 500 });
  }

  return Response.json({
    conversationId: conv.id,
    messages: messages ?? [],
  });
}

