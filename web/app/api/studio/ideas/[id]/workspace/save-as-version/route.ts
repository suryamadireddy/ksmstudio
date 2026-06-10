import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { copyWorkingDraftToDraft, findWorkingDraft } from "@/lib/portfolio/workspace-helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const working = findWorkingDraft(versions);
  if (!working) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const draft = copyWorkingDraftToDraft(working);
  const nextVersions = [...versions, draft];

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions: nextVersions });
  if (!saved.ok) return saved.response;

  return Response.json({ ok: true, version_id: draft.id });
}
