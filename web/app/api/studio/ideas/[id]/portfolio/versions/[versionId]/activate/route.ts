import { createClient } from "@/lib/supabase/server";

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

  // Archive previous active, activate target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions = portfolio.versions.map((v: any) => {
    if (v.id === versionId) return { ...v, status: "active" };
    if (v.status === "active") return { ...v, status: "archived" };
    return v;
  });

  await supabase
    .from("ideas")
    .update({ portfolio: { ...portfolio, versions, active_version_id: versionId } })
    .eq("id", id);

  return Response.json({ ok: true });
}
