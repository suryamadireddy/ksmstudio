import { createClient } from "@/lib/supabase/server";
import type { Portfolio } from "@/lib/types";
import { asPortfolio } from "./workspace-helpers";

export async function loadAuthorizedPortfolio(ideaId: string): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; portfolio: Portfolio }
  | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data, error } = await supabase
    .from("ideas")
    .select("portfolio")
    .eq("id", ideaId)
    .single();

  if (error || !data?.portfolio) {
    return { ok: false, response: Response.json({ error: "not_found" }, { status: 404 }) };
  }

  return { ok: true, supabase, portfolio: asPortfolio(data.portfolio) };
}

export async function savePortfolio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ideaId: string,
  portfolio: Portfolio,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { error } = await supabase.from("ideas").update({ portfolio }).eq("id", ideaId);
  if (error) {
    return {
      ok: false,
      response: Response.json({ error: "save_failed", detail: error.message }, { status: 500 }),
    };
  }
  return { ok: true };
}
