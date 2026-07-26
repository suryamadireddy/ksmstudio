import { createClient } from "@/lib/supabase/server";
import { casMutatePortfolio } from "@/lib/portfolio/cas";
import type { AccentColor, Portfolio, PortfolioVersion, VisualRegister } from "@/lib/types";
import { randomUUID } from "node:crypto";

interface PresentationPatch {
  accent_color?: AccentColor;
  visual_register?: VisualRegister;
  signature_library_component?: string | null;
  disabled_section_indices?: number[];
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, versionId } = await params;
  const patch: PresentationPatch = await req.json();

  const { data: row } = await supabase
    .from("ideas")
    .select("portfolio")
    .eq("id", id)
    .single();

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  const portfolio = row.portfolio as Portfolio | null;
  const source = portfolio?.versions?.find((v) => v.id === versionId);
  if (!source) return Response.json({ error: "version_not_found" }, { status: 404 });

  const updatedPresentation = {
    ...source.presentation,
    ...(patch.accent_color ? { accent_color: patch.accent_color } : {}),
    ...(patch.visual_register ? { visual_register: patch.visual_register } : {}),
    ...(patch.signature_library_component !== undefined
      ? {
          signature_element: {
            ...source.presentation.signature_element,
            library_component: patch.signature_library_component,
          },
        }
      : {}),
  };

  let updatedSections = source.public_summary.sections;
  if (patch.disabled_section_indices) {
    updatedSections = source.public_summary.sections.filter(
      (_: unknown, i: number) => !patch.disabled_section_indices!.includes(i),
    );
  }

  const newVersion: PortfolioVersion = {
    ...source,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    generated_by: "manual_edit",
    parent_version_id: versionId,
    status: "draft",
    presentation: updatedPresentation,
    public_summary: { ...source.public_summary, sections: updatedSections },
  };

  const result = await casMutatePortfolio(supabase, id, {
    type: "append_version",
    version: newVersion,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true, version_id: newVersion.id });
}
