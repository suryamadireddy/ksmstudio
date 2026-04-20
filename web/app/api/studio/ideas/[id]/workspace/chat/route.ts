import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { appendSnapshot } from "@/lib/portfolio/workspace-helpers";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const idx = versions.findIndex((v) => v.status === "working_draft");
  if (idx === -1) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const working = versions[idx] as PortfolioVersion;
  const { next } = appendSnapshot(working, "before_distillation");
  versions[idx] = next;

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions });
  if (!saved.ok) return saved.response;

  return Response.json({ message: "distillation wiring coming in Step 8" }, { status: 501 });
}
