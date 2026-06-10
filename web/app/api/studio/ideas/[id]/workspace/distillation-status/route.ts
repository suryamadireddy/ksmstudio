import { loadAuthorizedPortfolio } from "@/lib/portfolio/workspace-auth";
import { findWorkingDraft } from "@/lib/portfolio/workspace-helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  const working = findWorkingDraft(gate.portfolio.versions ?? []);
  if (!working) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const ds = working.distillation_status;
  if (ds) {
    return Response.json({
      status: ds.status,
      last_attempt_at: ds.last_attempt_at,
      ...(ds.error ? { error: ds.error } : {}),
    });
  }

  return Response.json({
    status: "idle" as const,
    last_attempt_at: working.created_at,
  });
}
