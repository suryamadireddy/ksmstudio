export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortfolioRender } from "@/components/portfolio/PortfolioRender";
import { ChatPanel } from "@/components/portfolio/ChatPanel";
import { Header } from "@/components/public/header";
import type { Idea, PortfolioVersion } from "@/lib/types";
import type { Metadata } from "next";

async function fetchPublished(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, raw_input, portfolio")
    .eq("published", true)
    .filter("portfolio->>slug", "eq", slug)
    .single();
  return data as Pick<Idea, "id" | "raw_input" | "portfolio"> | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await fetchPublished(slug);
  if (!row?.portfolio) return { title: "Not found" };
  const p = row.portfolio;

  const activeVersion = p.versions?.find(
    (v: PortfolioVersion) => v.id === p.active_version_id && v.status === "active",
  );
  const description =
    activeVersion?.voice?.summary ??
    (typeof p.public_summary === "string" ? p.public_summary : null) ??
    undefined;

  return {
    title: `${p.headline} | KSM Studio`,
    description,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await fetchPublished(slug);
  if (!row || !row.portfolio) notFound();

  const { portfolio } = row;

  // Phase 4 render — distilled version
  const activeVersion = portfolio.versions?.find(
    (v: PortfolioVersion) => v.id === portfolio.active_version_id && v.status === "active",
  );

  if (activeVersion) {
    return (
      <main style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
        <Header />
        <PortfolioRender version={activeVersion} />
        <ChatPanel
          ideaId={row.id}
          slug={slug}
          chatbotContext={activeVersion.chatbot_context}
        />
      </main>
    );
  }

  // Legacy fallback — pre-Phase-4 rows with public_summary string.
  // Remove after GeoNews is confirmed distilled and validated.
  const legacyHeadline = portfolio.headline;
  const legacySummary =
    typeof portfolio.public_summary === "string" ? portfolio.public_summary : null;

  if (!legacyHeadline && !legacySummary) notFound();

  return (
    <main style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
      <Header />
      <div className="mx-auto max-w-2xl px-8 py-24">
        {legacyHeadline && (
          <h1 className="mb-8 font-serif text-4xl font-normal leading-tight" style={{ color: "var(--fg)" }}>
            {legacyHeadline}
          </h1>
        )}
        {legacySummary && (
          <p className="text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            {legacySummary}
          </p>
        )}
      </div>
    </main>
  );
}
