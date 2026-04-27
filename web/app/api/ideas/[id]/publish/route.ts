import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { Portfolio } from "@/lib/types";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string, excludeId: string): Promise<string> {
  const { data } = await supabase
    .from("ideas")
    .select("id, portfolio")
    .eq("published", true)
    .neq("id", excludeId);

  const existingSlugs = new Set(
    (data ?? []).map((r: { portfolio?: { slug?: string } }) => r.portfolio?.slug).filter(Boolean)
  );

  if (!existingSlugs.has(base)) return base;
  let n = 2;
  while (existingSlugs.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, headline: providedHeadline } = await request.json();

  if (!["publish", "unpublish"].includes(action)) {
    return NextResponse.json({ error: "action must be publish or unpublish" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id, triage, portfolio")
    .eq("id", id)
    .single();

  if (error || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  if (action === "publish") {
    if (!idea.triage) {
      return NextResponse.json({ error: "Cannot publish an untriaged idea" }, { status: 422 });
    }

    const triage = idea.triage as { title?: string; triage_reasoning?: string };
    const title = triage.title ?? "";
    const baseSlug = generateSlug(title);
    const slug = await uniqueSlug(supabase, baseSlug, id);

    const existing = idea.portfolio as Portfolio | null;
    const headline =
      providedHeadline ??
      existing?.headline ??
      (triage.triage_reasoning?.split(/[.!?]/)[0]?.trim() ?? title);

    const portfolio: Portfolio = {
      published: true,
      published_at: existing?.published_at ?? new Date().toISOString(),
      unpublished_at: null,
      slug: existing?.slug ?? slug,
      headline,
      versions: existing?.versions ?? [],
      active_version_id: existing?.active_version_id ?? null,
      public_summary: existing?.public_summary ?? null,
      chatbot_context: existing?.chatbot_context ?? null,
    };

    await supabase.from("ideas").update({ published: true, portfolio }).eq("id", id);
    return NextResponse.json({ ok: true, slug: portfolio.slug, headline: portfolio.headline });
  }

  // unpublish
  const existing = (idea.portfolio ?? {}) as Partial<Portfolio>;
  const portfolio: Portfolio = {
    published: false,
    published_at: existing.published_at ?? null,
    unpublished_at: new Date().toISOString(),
    slug: existing.slug ?? "",
    headline: existing.headline ?? "",
    versions: existing.versions ?? [],
    active_version_id: existing.active_version_id ?? null,
    public_summary: existing.public_summary ?? null,
    chatbot_context: existing.chatbot_context ?? null,
  };

  await supabase.from("ideas").update({ published: false, portfolio }).eq("id", id);
  return NextResponse.json({ ok: true });
}
