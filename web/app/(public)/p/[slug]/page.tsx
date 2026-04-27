import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ideaDisplayName, type Idea } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function getIdea(slug: string): Promise<Idea | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, raw_input, domain, state, created_at, triage, development, portfolio")
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
  const name = ideaDisplayName(idea);
  return {
    title: `${name} | KSM Studio`,
    description: idea.triage?.triage_reasoning ?? undefined,
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

  const name = ideaDisplayName(idea);
  const t = idea.triage;
  const d = idea.development;

  if (!idea.published || !idea.portfolio) notFound();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
          KSM Studio · Case Study
        </p>
        <h1 className="mb-6 font-serif text-4xl font-normal leading-tight tracking-tight text-gray-900">
          {name}
        </h1>

        {idea.portfolio?.headline && (
          <p className="mb-6 text-xl text-gray-600">{idea.portfolio.headline}</p>
        )}

        {t?.who_benefits && (
          <p className="mb-10 text-lg text-gray-500">{t.who_benefits}</p>
        )}

        {d?.problem_statement && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Problem
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {d.problem_statement}
            </p>
          </section>
        )}

        {d?.core_hypothesis && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Core Hypothesis
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {d.core_hypothesis}
            </p>
          </section>
        )}

        {d?.prd?.solution && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Solution
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {d.prd.solution}
            </p>
          </section>
        )}

        {d?.personas && d.personas.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Who It&apos;s For
            </h2>
            <div className="space-y-4">
              {d.personas.map((p, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-5">
                  <p className="mb-1 font-medium text-gray-900">{p.label}</p>
                  <p className="mb-3 text-sm text-gray-500">{p.description}</p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Pain:</span> {p.pain}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Gain:</span> {p.gain}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {t?.kill_assumptions && t.kill_assumptions.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Key Assumptions
            </h2>
            <ul className="space-y-2">
              {t.kill_assumptions.map((a, i) => {
                const text = typeof a === "object" ? a.text : a;
                return (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                    {text}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
