import { createClient } from "@/lib/supabase/server";
import { casMutatePortfolio } from "@/lib/portfolio/cas";
import type { Portfolio, PortfolioVersion } from "@/lib/types";
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

  const portfolio = row.portfolio as Portfolio | null;
  const source = portfolio?.versions?.find((v) => v.id === versionId);
  if (!source) return Response.json({ error: "version_not_found" }, { status: 404 });

  const newVersion: PortfolioVersion = {
    ...source,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    generated_by: "manual_edit",
    parent_version_id: versionId,
    status: "draft",
    creative_brief: null,
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
