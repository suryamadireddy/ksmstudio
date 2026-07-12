import { createClient } from "@/lib/supabase/server";
import { isRenderablePortfolioVersion } from "@/lib/portfolio/version-validation";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

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
  if (!isRenderablePortfolioVersion(source)) {
    return Response.json({ error: "invalid_version" }, { status: 400 });
  }

  // Archive previous active, activate target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions = portfolio.versions.map((v: any) => {
    if (v.id === versionId) return { ...v, status: "active" };
    if (v.status === "active") return { ...v, status: "archived" };
    return v;
  });

  const { error } = await supabase
    .from("ideas")
    .update({ portfolio: { ...portfolio, versions, active_version_id: versionId } })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
