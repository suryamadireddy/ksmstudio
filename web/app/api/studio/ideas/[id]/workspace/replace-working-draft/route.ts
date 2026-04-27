import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { branchWorkingDraftFromVersionSource, normalizeVersion } from "@/lib/portfolio/workspace-helpers";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let body: { source_version_id?: string };
  try {
    body = (await req.json()) as { source_version_id?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.source_version_id !== "string" || !body.source_version_id.trim()) {
    return Response.json({ error: "source_version_id_required" }, { status: 400 });
  }

  const sourceVersionId = body.source_version_id.trim();
  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])].map((v) => normalizeVersion(v as PortfolioVersion));

  const source = versions.find((v) => v.id === sourceVersionId);
  if (!source) {
    return Response.json({ error: "version_not_found" }, { status: 404 });
  }
  if (source.status === "working_draft") {
    return Response.json({ error: "invalid_source_version" }, { status: 400 });
  }

  const existingWd = versions.find((v) => v.status === "working_draft");
  if (existingWd && existingWd.id === sourceVersionId) {
    return Response.json({ error: "invalid_source_version" }, { status: 400 });
  }

  const withoutWorking = versions.filter((v) => v.status !== "working_draft");

  let working: PortfolioVersion;
  try {
    working = branchWorkingDraftFromVersionSource(source);
  } catch {
    return Response.json({ error: "invalid_source_version" }, { status: 400 });
  }

  const nextVersions = [...withoutWorking, working];

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions: nextVersions });
  if (!saved.ok) return saved.response;

  return Response.json({ ok: true, working_draft_id: working.id });
}
