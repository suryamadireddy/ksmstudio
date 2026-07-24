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
    const statementSection = activeVersion?.public_summary?.sections?.find(
      (s) => s.archetype === "statement",
    );
    const statementText =
      statementSection &&
      typeof statementSection.content === "object" &&
      statementSection.content !== null &&
      "text" in statementSection.content &&
      typeof (statementSection.content as { text?: unknown }).text === "string"
        ? (statementSection.content as { text: string }).text
        : null;
    const summary = statementText ?? activeVersion?.voice?.summary ?? null;

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
