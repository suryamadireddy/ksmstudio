import { createClient } from "@/lib/supabase/server";
import type { AccentColor, VisualRegister } from "@/lib/types";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolio = row.portfolio as any;
  if (!portfolio?.versions) return Response.json({ error: "no_versions" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = portfolio.versions.find((v: any) => v.id === versionId);
  if (!source) return Response.json({ error: "version_not_found" }, { status: 404 });

  // Manual edits create a new draft branched from the source
  const { randomUUID } = await import("node:crypto");
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

  const newVersion = {
    ...source,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    generated_by: "manual_edit",
    parent_version_id: versionId,
    status: "draft",
    presentation: updatedPresentation,
    public_summary: { ...source.public_summary, sections: updatedSections },
  };

  const versions = [...portfolio.versions, newVersion];

  await supabase
    .from("ideas")
    .update({ portfolio: { ...portfolio, versions } })
    .eq("id", id);

  return Response.json({ ok: true, version_id: newVersion.id });
}
