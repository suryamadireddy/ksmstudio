import { createClient } from "@supabase/supabase-js";

export type PublicProjectCard = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  rawIdea?: string | null;
  coverImage: string;
};

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function ideaTitle(idea: {
  triage: { title?: string } | null;
  raw_input: string;
}): string {
  const title = idea.triage?.title;
  if (title) return title;
  const raw = idea.raw_input?.trim() ?? "";
  return raw.length > 60 ? raw.slice(0, 60) + "…" : raw || "Untitled idea";
}

export async function getFeaturedPublicProjects(): Promise<PublicProjectCard[]> {
  const supabase = serverSupabase();

  const { data, error } = await supabase
    .from("ideas")
    .select("id, raw_input, triage, development")
    .not("triage", "is", null)
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    console.error("Error fetching ideas for landing page:", error);
    return [];
  }

  return (data ?? []).map((idea) => {
    const triage = idea.triage as {
      title?: string;
      who_benefits?: string;
      triage_reasoning?: string;
    } | null;

    const summary =
      triage?.who_benefits && triage?.triage_reasoning
        ? `${triage.who_benefits} — ${triage.triage_reasoning}`
        : triage?.who_benefits ?? triage?.triage_reasoning ?? null;

    return {
      id: idea.id,
      slug: idea.id,
      title: ideaTitle({ triage, raw_input: idea.raw_input }),
      summary,
      rawIdea: idea.raw_input ?? null,
      coverImage: "/file.svg", // used only by ProjectCard, not FeaturedProjects
    };
  });
}
