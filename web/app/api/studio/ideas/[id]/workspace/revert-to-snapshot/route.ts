import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import type { PortfolioVersion, WorkingDraftSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let body: { snapshot_id?: string };
  try {
    body = (await req.json()) as { snapshot_id?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.snapshot_id !== "string" || !body.snapshot_id) {
    return Response.json({ error: "snapshot_id_required" }, { status: 400 });
  }

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const idx = versions.findIndex((v) => v.status === "working_draft");
  if (idx === -1) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const working = versions[idx] as PortfolioVersion;
  const snap = working.snapshots.find((s: WorkingDraftSnapshot) => s.id === body.snapshot_id);
  if (!snap) {
    return Response.json({ error: "snapshot_not_found" }, { status: 404 });
  }

  versions[idx] = {
    ...working,
    presentation: structuredClone(snap.presentation),
    public_summary: structuredClone(snap.public_summary),
    chatbot_context: structuredClone(snap.chatbot_context),
    voice: structuredClone(snap.voice),
  };

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions });
  if (!saved.ok) return saved.response;

  return Response.json({ ok: true });
}
