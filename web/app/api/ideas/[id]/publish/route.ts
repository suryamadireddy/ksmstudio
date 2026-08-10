import { createClient } from "@/lib/supabase/server";
import {
  collectTakenSlugs,
  resolvePublishSlug,
} from "@/lib/portfolio/slug";
import { NextRequest, NextResponse } from "next/server";
import type { Portfolio } from "@/lib/types";

async function takenSlugsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excludeId: string,
): Promise<{ ok: true; taken: Set<string> } | { ok: false; error: string }> {
  // Spec: uniqueness across ALL ideas — unpublished rows still reserve their slug.
  const { data, error } = await supabase
    .from("ideas")
    .select("id, portfolio")
    .neq("id", excludeId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    taken: collectTakenSlugs(
      (data ?? []) as Array<{ portfolio?: { slug?: string | null } | null }>,
    ),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { action?: string; headline?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, headline: providedHeadline } = body;

  if (!["publish", "unpublish"].includes(action ?? "")) {
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
    const existing = idea.portfolio as Portfolio | null;

    const takenResult = await takenSlugsFor(supabase, id);
    if (!takenResult.ok) {
      return NextResponse.json({ error: takenResult.error }, { status: 500 });
    }

    const slug = resolvePublishSlug({
      title,
      ideaId: id,
      existingSlug: existing?.slug,
      takenSlugs: takenResult.taken,
    });

    const headline =
      providedHeadline ??
      existing?.headline ??
      (triage.triage_reasoning?.split(/[.!?]/)[0]?.trim() ?? title);

    const portfolio: Portfolio = {
      published: true,
      published_at: existing?.published_at ?? new Date().toISOString(),
      unpublished_at: null,
      slug,
      headline,
      versions: existing?.versions ?? [],
      active_version_id: existing?.active_version_id ?? null,
      public_summary: existing?.public_summary ?? null,
      chatbot_context: existing?.chatbot_context ?? null,
    };

    const { error: updateError } = await supabase
      .from("ideas")
      .update({ published: true, portfolio })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

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

  const { error: updateError } = await supabase
    .from("ideas")
    .update({ published: false, portfolio })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
