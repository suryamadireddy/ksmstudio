export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Idea, JournalEntry, Refinement, Conversation, Message } from "@/lib/types";
import IdeaDetailShell from "./_components/IdeaDetailShell";

async function fetchAll(id: string) {
  const supabase = await createClient();

  const [ideaRes, journalRes, refinementsRes, convsRes, msgsRes] =
    await Promise.all([
      supabase.from("ideas").select("*").eq("id", id).single(),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("idea_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("refinements")
        .select("*")
        .eq("idea_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversations")
        .select("*")
        .eq("idea_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("*")
        .eq("idea_id", id)
        .order("created_at", { ascending: true }),
    ]);

  return {
    idea: ideaRes.data as Idea | null,
    journal: (journalRes.data ?? []) as JournalEntry[],
    refinements: (refinementsRes.data ?? []) as Refinement[],
    conversations: (convsRes.data ?? []) as Conversation[],
    messages: (msgsRes.data ?? []) as Message[],
  };
}

export default async function IdeaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { idea, journal, refinements, conversations, messages } =
    await fetchAll(id);

  if (!idea) notFound();

  return (
    <IdeaDetailShell
      idea={idea}
      journal={journal}
      refinements={refinements}
      conversations={conversations}
      messages={messages}
      activeTab={tab ?? "overview"}
    />
  );
}
