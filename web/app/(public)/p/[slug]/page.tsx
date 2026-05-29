import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Idea } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function getIdea(slug: string): Promise<Idea | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, raw_input, created_at, published, portfolio")
    .eq("published", true)
    .eq("portfolio->>slug", slug)
    .single();
  return (data as Idea) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getIdea(slug);
  if (!idea) return { title: "Not found" };
  const name = idea.portfolio?.headline ?? "Project";
  return {
    title: `${name} | KSM Studio`,
    description:
      typeof idea.portfolio?.public_summary === "string"
        ? idea.portfolio.public_summary
        : undefined,
  };
}

export default async function PublicIdeaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const idea = await getIdea(slug);
  if (!idea) notFound();
  if (!idea.published || !idea.portfolio) notFound();
  redirect(`/projects/${slug}`);
}
