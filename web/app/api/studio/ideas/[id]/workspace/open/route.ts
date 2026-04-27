import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { branchWorkingDraftFromActive, findWorkingDraft } from "@/lib/portfolio/workspace-helpers";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  const { supabase, portfolio } = gate;
  const versions = portfolio.versions ?? [];
  const existing = findWorkingDraft(versions);
  if (existing) {
    return Response.json({ working_draft_id: existing.id });
  }

  const activeId = portfolio.active_version_id;
  const active = activeId
    ? versions.find((v: PortfolioVersion) => v.id === activeId && v.status === "active")
    : undefined;

  if (!active) {
    return Response.json({ needs_initial_generation: true }, { status: 409 });
  }

  const working = branchWorkingDraftFromActive(active);
  const nextPortfolio = {
    ...portfolio,
    versions: [...versions, working],
  };

  const saved = await savePortfolio(supabase, ideaId, nextPortfolio);
  if (!saved.ok) return saved.response;

  return Response.json({ working_draft_id: working.id });
}
