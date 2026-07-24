import { createClient } from "@/lib/supabase/server";
import { findActivePortfolioVersion } from "@/lib/portfolio/active-version";
import type { Portfolio } from "@/lib/types";

export type PublicProjectCard = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  coverImage: string;
};

export async function getFeaturedPublicProjects(): Promise<PublicProjectCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, portfolio")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data) return [];

  return data.flatMap((row): PublicProjectCard[] => {
    const portfolio = row.portfolio as Portfolio | null;
    if (!portfolio?.slug || !portfolio?.headline) return [];

    const activeVersion = findActivePortfolioVersion(portfolio);

    // Pull summary from statement section if present, else voice.summary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statementSection = activeVersion?.public_summary?.sections?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.archetype === "statement",
    );
    const summary =
      statementSection?.content?.text ?? activeVersion?.voice?.summary ?? null;

    return [
      {
        id: row.id,
        title: portfolio.headline,
        slug: portfolio.slug,
        summary,
        coverImage: "/placeholder.svg",
      },
    ];
  });
}
