import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";

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

  const newVersion = {
    ...source,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    generated_by: "manual_edit",
    parent_version_id: versionId,
    status: "draft",
    creative_brief: null,
  };

  const versions = [...portfolio.versions, newVersion];

  await supabase
    .from("ideas")
    .update({ portfolio: { ...portfolio, versions } })
    .eq("id", id);

  return Response.json({ ok: true, version_id: newVersion.id });
}
