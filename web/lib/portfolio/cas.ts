import { createClient } from "@/lib/supabase/server";
import type { Portfolio } from "@/lib/types";
import {
  applyPortfolioMutation,
  portfolioVersionToken,
  type PortfolioMutation,
} from "@/lib/portfolio/mutate";

const MAX_CAS_ATTEMPTS = 3;

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CasPortfolioResult =
  | { ok: true; portfolio: Portfolio }
  | { ok: false; status: number; error: string };

/**
 * Read-modify-write portfolio JSONB with compare-and-swap on `updated_at`.
 * Retries when a concurrent writer wins the race.
 */
export async function casMutatePortfolio(
  supabase: Supabase,
  ideaId: string,
  mutation: PortfolioMutation,
): Promise<CasPortfolioResult> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: idea, error } = await supabase
      .from("ideas")
      .select("id, portfolio")
      .eq("id", ideaId)
      .single();

    if (error || !idea) {
      return { ok: false, status: 404, error: "not_found" };
    }

    const previous = idea.portfolio as Portfolio | null;
    const expectedToken = portfolioVersionToken(previous);
    const result = applyPortfolioMutation(previous, mutation);
    if (!result.ok) {
      return { ok: false, status: 400, error: result.error };
    }

    let update = supabase
      .from("ideas")
      .update({ portfolio: result.portfolio })
      .eq("id", ideaId);

    if (previous == null) {
      update = update.is("portfolio", null);
    } else if (expectedToken) {
      update = update.eq("portfolio->>updated_at", expectedToken);
    }
    // Legacy rows missing updated_at: best-effort write (no CAS).
    // The write stamps a token so subsequent updates are protected.

    const { data: updated, error: updateError } = await update.select("id");

    if (updateError) {
      console.error("portfolio update error:", updateError);
      return { ok: false, status: 500, error: "db_error" };
    }

    if (updated && updated.length > 0) {
      return { ok: true, portfolio: result.portfolio };
    }
  }

  return {
    ok: false,
    status: 409,
    error: "portfolio_conflict",
  };
}

/**
 * Like casMutatePortfolio, but also updates top-level `ideas.published`
 * in the same write (publish / unpublish).
 */
export async function casMutatePortfolioPublish(
  supabase: Supabase,
  ideaId: string,
  mutation: Extract<PortfolioMutation, { type: "publish" | "unpublish" }>,
): Promise<CasPortfolioResult> {
  const published = mutation.type === "publish";

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: idea, error } = await supabase
      .from("ideas")
      .select("id, portfolio")
      .eq("id", ideaId)
      .single();

    if (error || !idea) {
      return { ok: false, status: 404, error: "not_found" };
    }

    const previous = idea.portfolio as Portfolio | null;
    const expectedToken = portfolioVersionToken(previous);
    const result = applyPortfolioMutation(previous, mutation);
    if (!result.ok) {
      return { ok: false, status: 400, error: result.error };
    }

    let update = supabase
      .from("ideas")
      .update({ published, portfolio: result.portfolio })
      .eq("id", ideaId);

    if (previous == null) {
      update = update.is("portfolio", null);
    } else if (expectedToken) {
      update = update.eq("portfolio->>updated_at", expectedToken);
    }

    const { data: updated, error: updateError } = await update.select("id");

    if (updateError) {
      console.error("portfolio publish update error:", updateError);
      return { ok: false, status: 500, error: "db_error" };
    }

    if (updated && updated.length > 0) {
      return { ok: true, portfolio: result.portfolio };
    }
  }

  return {
    ok: false,
    status: 409,
    error: "portfolio_conflict",
  };
}
