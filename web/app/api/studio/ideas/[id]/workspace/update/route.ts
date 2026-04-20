import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import {
  alignPublicSummaryWithPresentationSections,
  applyPresentationPatch,
  parsePresentationPatch,
} from "@/lib/portfolio/workspace-helpers";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let patch;
  try {
    patch = parsePresentationPatch(await req.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_body";
    return Response.json({ error: msg }, { status: 400 });
  }

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const idx = versions.findIndex((v) => v.status === "working_draft");
  if (idx === -1) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }

  const working = versions[idx] as PortfolioVersion;
  const presentationBefore = working.presentation;
  let presentation = working.presentation;
  try {
    presentation = applyPresentationPatch(presentation, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_patch";
    return Response.json({ error: msg }, { status: 400 });
  }

  if (patch.layout_template !== undefined && patch.layout_template_rationale === undefined) {
    presentation = {
      ...presentation,
      layout_template_rationale: "Template updated in workspace.",
    };
  }

  let public_summary = working.public_summary;
  if (patch.sections !== undefined) {
    public_summary = alignPublicSummaryWithPresentationSections(
      presentationBefore,
      working.public_summary,
      presentation.sections,
    );
  }

  versions[idx] = { ...working, presentation, public_summary };

  const saved = await savePortfolio(supabase, ideaId, { ...portfolio, versions });
  if (!saved.ok) return saved.response;

  return Response.json({ ok: true });
}
