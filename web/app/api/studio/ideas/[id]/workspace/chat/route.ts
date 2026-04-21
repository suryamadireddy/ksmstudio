import { spawn } from "node:child_process";
import path from "node:path";
import { Anthropic } from "@anthropic-ai/sdk";
import { CONVERSE_MODEL } from "@/lib/models";
import { composeWorkspaceChatPrompt } from "@/lib/portfolio/compose-workspace-chat-prompt";
import { loadAuthorizedPortfolio, savePortfolio } from "@/lib/portfolio/workspace-auth";
import { appendSnapshot } from "@/lib/portfolio/workspace-helpers";
import {
  actionToDistillMode,
  actionUpdateScope,
  parseProposedEdit,
  stripProposedEditBlock,
  type WorkspaceProposedEdit,
} from "@/lib/portfolio/workspace-proposed-edit";
import type { PortfolioVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  const gate = await loadAuthorizedPortfolio(ideaId);
  if (!gate.ok) return gate.response;

  let body:
    | { type?: "message"; message?: string; conversationId?: string }
    | { type: "accept_proposal"; conversationId?: string; proposalMessageId?: string; proposal?: WorkspaceProposedEdit }
    | { type: "reject_proposal"; conversationId?: string; proposalMessageId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { supabase, portfolio } = gate;
  const versions = [...(portfolio.versions ?? [])];
  const idx = versions.findIndex((v) => v.status === "working_draft");
  if (idx === -1) {
    return Response.json({ error: "no_working_draft" }, { status: 400 });
  }
  const working = versions[idx] as PortfolioVersion;
  const type = body.type ?? "message";

  const ensureWorkspaceConversation = async (conversationId?: string) => {
    if (!conversationId) {
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("conversations").insert({
        id: newId,
        idea_id: ideaId,
        context: "workspace_edit",
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error("conversation_insert_failed");
      return newId;
    }
    const { data, error } = await supabase
      .from("conversations")
      .select("id, context, idea_id")
      .eq("id", conversationId)
      .single();
    if (error || !data || data.idea_id !== ideaId || data.context !== "workspace_edit") {
      throw new Error("invalid_workspace_conversation");
    }
    return conversationId;
  };

  const readProposalFromMessage = async (
    conversationId: string,
    proposalMessageId?: string,
  ): Promise<WorkspaceProposedEdit | null> => {
    if (proposalMessageId) {
      const { data } = await supabase
        .from("messages")
        .select("content, extracted")
        .eq("id", proposalMessageId)
        .eq("conversation_id", conversationId)
        .single();
      if (!data) return null;
      const extracted = data.extracted as { proposed_edit?: WorkspaceProposedEdit } | null;
      return extracted?.proposed_edit ?? parseProposedEdit(String(data.content ?? ""));
    }
    const { data } = await supabase
      .from("messages")
      .select("content, extracted")
      .eq("conversation_id", conversationId)
      .eq("role", "idea")
      .order("created_at", { ascending: false })
      .limit(1);
    const last = data?.[0];
    if (!last) return null;
    const extracted = last.extracted as { proposed_edit?: WorkspaceProposedEdit } | null;
    return extracted?.proposed_edit ?? parseProposedEdit(String(last.content ?? ""));
  };

  const encoder = new TextEncoder();
  const sse = (event: string, payload: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  if (type === "reject_proposal") {
    let convId: string;
    try {
      convId = await ensureWorkspaceConversation(body.conversationId);
    } catch {
      return Response.json({ error: "invalid_workspace_conversation" }, { status: 400 });
    }
    if (body.proposalMessageId) {
      const { data } = await supabase
        .from("messages")
        .select("extracted")
        .eq("id", body.proposalMessageId)
        .eq("conversation_id", convId)
        .single();
      if (data) {
        const extracted = (data.extracted as Record<string, unknown> | null) ?? {};
        await supabase
          .from("messages")
          .update({
            extracted: {
              ...extracted,
              proposal_status: "rejected",
              proposal_rejected_at: new Date().toISOString(),
            },
          })
          .eq("id", body.proposalMessageId);
      }
    }
    return Response.json({ ok: true });
  }

  if (type === "accept_proposal") {
    let convId: string;
    try {
      convId = await ensureWorkspaceConversation(body.conversationId);
    } catch {
      return Response.json({ error: "invalid_workspace_conversation" }, { status: 400 });
    }
    const proposal = body.proposal ?? (await readProposalFromMessage(convId, body.proposalMessageId));
    if (!proposal) {
      return Response.json({ error: "proposal_required" }, { status: 400 });
    }

    const { next: withSnapshot } = appendSnapshot(working, "before_distillation");
    versions[idx] = {
      ...withSnapshot,
      distillation_status: { status: "running", last_attempt_at: new Date().toISOString() },
    };
    const startSaved = await savePortfolio(supabase, ideaId, { ...portfolio, versions });
    if (!startSaved.ok) return startSaved.response;

    const mode = actionToDistillMode(proposal.action);
    const args = ["distill.py", ideaId, "--mode", mode, "--brief", proposal.brief];
    const projectRoot = path.resolve(process.cwd(), "..");
    const proc = spawn("python3", args, { cwd: projectRoot, env: { ...process.env } });
    let stdout = "";

    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(sse("accepted", { conversationId: convId, proposal, mode }));

          proc.stdout.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            stdout += text;
            controller.enqueue(sse("distill_progress", { stream: "stdout", text }));
          });

          proc.stderr.on("data", (chunk: Buffer) => {
            controller.enqueue(sse("distill_progress", { stream: "stderr", text: chunk.toString() }));
          });

          proc.on("close", async (code) => {
            const matches = stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi);
            const distilledVersionId = matches?.[matches.length - 1];

            const setFailed = async (error: string) => {
              const gate2 = await loadAuthorizedPortfolio(ideaId);
              if (gate2.ok) {
                const vv = [...(gate2.portfolio.versions ?? [])];
                const wdIdx = vv.findIndex((v) => v.status === "working_draft");
                if (wdIdx >= 0) {
                  vv[wdIdx] = {
                    ...vv[wdIdx],
                    distillation_status: {
                      status: "failed",
                      last_attempt_at: new Date().toISOString(),
                      error,
                    },
                  };
                  await savePortfolio(gate2.supabase, ideaId, { ...gate2.portfolio, versions: vv });
                }
              }
              controller.enqueue(sse("distill_error", { error }));
              controller.close();
            };

            if (code !== 0 || !distilledVersionId) {
              await setFailed(`distill_failed:${code ?? "unknown"}`);
              return;
            }

            const gate2 = await loadAuthorizedPortfolio(ideaId);
            if (!gate2.ok) {
              controller.enqueue(sse("distill_error", { error: "reload_failed" }));
              controller.close();
              return;
            }

            const vv = [...(gate2.portfolio.versions ?? [])];
            const wdIdx = vv.findIndex((v) => v.status === "working_draft");
            const createdIdx = vv.findIndex((v) => v.id === distilledVersionId);
            if (wdIdx < 0 || createdIdx < 0) {
              await setFailed("distill_output_missing");
              return;
            }
            const wd = vv[wdIdx] as PortfolioVersion;
            const created = vv[createdIdx] as PortfolioVersion;
            const scopes = actionUpdateScope(proposal.action);
            const updated: PortfolioVersion = { ...wd };
            if (scopes.includes("presentation")) updated.presentation = created.presentation;
            if (scopes.includes("public_summary")) updated.public_summary = created.public_summary;
            if (scopes.includes("chatbot_context")) updated.chatbot_context = created.chatbot_context;
            if (scopes.includes("voice")) updated.voice = created.voice;
            updated.distillation_status = {
              status: "idle",
              last_attempt_at: new Date().toISOString(),
            };
            vv[wdIdx] = updated;
            vv.splice(createdIdx, 1);
            const doneSaved = await savePortfolio(gate2.supabase, ideaId, {
              ...gate2.portfolio,
              versions: vv,
            });
            if (!doneSaved.ok) {
              await setFailed("workspace_update_failed");
              return;
            }

            if (body.proposalMessageId) {
              const { data } = await supabase
                .from("messages")
                .select("extracted")
                .eq("id", body.proposalMessageId)
                .eq("conversation_id", convId)
                .single();
              if (data) {
                const extracted = (data.extracted as Record<string, unknown> | null) ?? {};
                await supabase
                  .from("messages")
                  .update({
                    extracted: {
                      ...extracted,
                      proposal_status: "accepted",
                      proposal_accepted_at: new Date().toISOString(),
                    },
                  })
                  .eq("id", body.proposalMessageId);
              }
            }

            controller.enqueue(sse("distill_done", { mode, action: proposal.action, updated_fields: scopes }));
            controller.close();
          });

          proc.on("error", () => {
            controller.enqueue(sse("distill_error", { error: "distill_spawn_failed" }));
            controller.close();
          });
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
    );
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }
  let convId: string;
  try {
    convId = await ensureWorkspaceConversation(body.conversationId);
  } catch {
    return Response.json({ error: "invalid_workspace_conversation" }, { status: 400 });
  }
  const userMessage = body.message.trim();
  const userIns = await supabase.from("messages").insert({
    id: crypto.randomUUID(),
    conversation_id: convId,
    idea_id: ideaId,
    role: "user",
    content: userMessage,
    created_at: new Date().toISOString(),
  });
  if (userIns.error) return Response.json({ error: "message_insert_failed" }, { status: 500 });

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at");
  const anthropic = new Anthropic();
  const stream = await anthropic.messages.create({
    model: CONVERSE_MODEL,
    max_tokens: 1024,
    system: composeWorkspaceChatPrompt(working),
    messages: (history ?? []).map((m) => ({
      role: m.role === "idea" ? "assistant" : (m.role as "user" | "assistant"),
      content: m.content,
    })),
    stream: true,
  });

  let full = "";
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(sse("conversation", { conversationId: convId }));
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(sse("assistant_delta", { text: event.delta.text }));
          }
        }
        const proposal = parseProposedEdit(full);
        const stripped = stripProposedEditBlock(full);
        await supabase.from("messages").insert({
          id: crypto.randomUUID(),
          conversation_id: convId,
          idea_id: ideaId,
          role: "idea",
          content: full,
          extracted: proposal ? { proposed_edit: proposal, proposal_status: "pending" } : null,
          created_at: new Date().toISOString(),
        });
        controller.enqueue(sse("assistant_done", { text: stripped, has_proposal: Boolean(proposal) }));
        if (proposal) controller.enqueue(sse("proposed_edit", proposal));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
  );
}
