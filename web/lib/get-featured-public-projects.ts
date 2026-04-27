import { createClient } from "@/lib/supabase/server";

export type PublicProjectCard = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  rawIdea?: string | null;
  coverImage: string;
};

export async function getFeaturedPublicProjects(): Promise<PublicProjectCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, raw_input, portfolio")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data) return [];

  return data.flatMap((row): PublicProjectCard[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portfolio = row.portfolio as any;
    if (!portfolio?.slug || !portfolio?.headline) return [];

    const activeVersion = portfolio.versions?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.id === portfolio.active_version_id,
    );

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
        rawIdea: row.raw_input,
        coverImage: "/placeholder.svg",
      },
    ];
  });
}
