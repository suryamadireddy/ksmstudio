import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toPublicCaseStudy } from "@/lib/public/case-study";
import type { Idea } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function getPublicCaseStudy(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select(
      "id, raw_input, domain, state, created_at, published, triage, development, portfolio",
    )
    .eq("published", true)
    .eq("portfolio->>slug", slug)
    .single();

  return toPublicCaseStudy(data as Idea | null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = await getPublicCaseStudy(slug);
  if (!study) return { title: "Not found" };
  return {
    title: `${study.name} | KSM Studio`,
    description: study.metaDescription ?? undefined,
  };
}

export default async function PublicIdeaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const study = await getPublicCaseStudy(slug);
  if (!study) notFound();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
          KSM Studio · Case Study
        </p>
        <h1 className="mb-6 font-serif text-4xl font-normal leading-tight tracking-tight text-gray-900">
          {study.name}
        </h1>

        {study.headline && (
          <p className="mb-6 text-xl text-gray-600">{study.headline}</p>
        )}

        {study.whoBenefits && (
          <p className="mb-10 text-lg text-gray-500">{study.whoBenefits}</p>
        )}

        {study.problemStatement && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Problem
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {study.problemStatement}
            </p>
          </section>
        )}

        {study.coreHypothesis && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Core Hypothesis
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {study.coreHypothesis}
            </p>
          </section>
        )}

        {study.solution && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Solution
            </h2>
            <p className="text-base leading-relaxed text-gray-700">
              {study.solution}
            </p>
          </section>
        )}

        {study.personas.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Who It&apos;s For
            </h2>
            <div className="space-y-4">
              {study.personas.map((p, i) => (
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
      </div>
    </main>
  );
}
