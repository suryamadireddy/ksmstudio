import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { appendSnapshot, findWorkingDraft } from "@/lib/portfolio/workspace-helpers";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

type SnapshotTrigger = "autosave" | "explicit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let body: { trigger?: SnapshotTrigger };
  try {
    body = (await req.json()) as { trigger?: SnapshotTrigger };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const trigger = body.trigger;
  if (trigger !== "autosave" && trigger !== "explicit") {
    return Response.json({ error: "invalid_trigger" }, { status: 400 });
  }

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const idx = versions.findIndex((v) => v.status === "working_draft");
  if (idx === -1) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const working = versions[idx] as PortfolioVersion;
  const { next, appended } = appendSnapshot(working, trigger);
  versions[idx] = next;

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions });
  if (!saved.ok) return saved.response;

  return Response.json({ ok: true, appended });
}
