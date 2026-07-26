import { createClient } from "@/lib/supabase/server";
import { casMutatePortfolio } from "@/lib/portfolio/cas";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, versionId } = await params;
  const result = await casMutatePortfolio(supabase, id, {
    type: "activate",
    versionId,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true });
}
