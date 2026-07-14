import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

  const { data: row, error: readError } = await supabase
    .from("ideas")
    .select("portfolio, published")
    .eq("id", id)
    .single();

  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolio = row.portfolio as any;
  if (!portfolio?.versions) return Response.json({ error: "no_versions" }, { status: 400 });

  // Archiving the active version clears the public renderer's only approved
  // version. Require an explicit unpublish first so a published URL cannot be
  // hollowed out by a version-management action.
  if (row.published && portfolio.active_version_id === versionId) {
    return Response.json(
      { error: "unpublish_before_archiving_active_version" },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions = portfolio.versions.map((v: any) =>
    v.id === versionId ? { ...v, status: "archived" } : v,
  );

  const newActiveId =
    portfolio.active_version_id === versionId ? null : portfolio.active_version_id;

  const { error: updateError } = await supabase
    .from("ideas")
    .update({ portfolio: { ...portfolio, versions, active_version_id: newActiveId } })
    .eq("id", id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
