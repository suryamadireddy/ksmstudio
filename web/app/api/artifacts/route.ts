import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { PIPELINE_MODEL } from "@/lib/models";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Stage ordering ─────────────────────────────────────────────────────────────

const STAGES = ["prd", "mvp_scope", "next_steps", "builder_brief"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  prd: "PRD",
  mvp_scope: "MVP Scope",
  next_steps: "Next Steps",
  builder_brief: "Builder Brief",
};

const MAX_TOKENS: Record<Stage, number> = {
  prd: 16000,
  mvp_scope: 16000,
  next_steps: 16000,
  builder_brief: 16000,
};

// ── System prompts (exact copies from artifacts.py) ───────────────────────────

const PRD_SYSTEM = `You are a product requirements writer. You receive the full context from the
triage and sharpening stages. Your job is to produce a PRD that is honest,
minimal, and immediately actionable — not a document that looks thorough
but isn't.

What a good PRD does at this stage:
It answers one question for a builder: "What exactly am I building, for whom,
and how will I know it worked?" Nothing more.

It does not:
- Speculate about future versions
- List every possible feature
- Use filler language like "seamless," "intuitive," or "robust"
- Pretend you have certainty you don't have

Output structure — use these exact headings:

### Problem
Copy the problem statement from sharpening verbatim. Do not rewrite it.
If it needs changing, flag it and stop.

### Solution
2–3 sentences. What this product does, stated plainly. Start with the verb:
"A tool that...", "A system that...", "An interface that..."
No product names, no marketing language.

### User stories
Numbered list. Generate user stories in strict format:
"As a [persona label], I want to [specific action] so that [specific outcome]."

Rules:
- One story per core capability only — no edge cases at this stage
- Maximum 6 stories total
- The action must be something a user literally does, not something they feel
- The outcome must be measurable or observable
- Derive stories directly from persona pain and gain fields — do not invent
  new jobs-to-be-done that weren't surfaced in sharpening

### Out of scope
Numbered list. 4–6 things this MVP explicitly does not do.

Rules:
- Each item must be something a reasonable person would expect this product to do
- State why it's out of scope in 5 words or fewer
- Format: "[Feature or capability] — [reason]"

### Success metrics
Numbered list. 3 metrics maximum. Each must be:
- Tied directly to the validation signal in the core hypothesis
- Measurable without instrumentation you don't have yet
- Expressed as a threshold: "70% of users return within 7 days" not "retention improves"

### Constraints
A single paragraph covering real constraints only — things that will actually
shape what gets built. Address: Technical, Time, Data, Dependencies.
Do not use a list — write it as connected prose.

### Red flags
Numbered list. Product risks or assumptions that could invalidate this PRD if wrong.
Each item: one sentence, one specific risk.

Behavioral rules:
- If open questions could materially change user stories or success metrics,
  flag at the top: "⚠ Open question [X] is unresolved and may invalidate
  [specific section]. Consider resolving before building."
- Do not generate stories for personas marked proxy_for_real_user: false
  without flagging: "(unvalidated persona — treat this story as a hypothesis)"
- If you cannot derive a measurable success metric, say so explicitly.`;

const MVP_SYSTEM = `You are an MVP scoping agent. You receive the full context from triage,
sharpening, and the completed PRD. Your job is to produce the minimum
feature set that proves the core hypothesis — nothing more.

The scoping principle:
An MVP is not a small version of the full product. It is the smallest thing
that can return a definitive answer to the core hypothesis.

Every feature you include must pass this test:
"If I removed this, could I still prove or disprove the core hypothesis?"
If yes — cut it.

Step 1: Feature extraction
Read the PRD user stories. For each story, generate a candidate feature.

Candidate feature format:
{
  "name": "<short label>",
  "description": "<what it does in one sentence>",
  "story_ref": "<the user story it serves>",
  "hypothesis_link": "<which part of the core hypothesis this proves>",
  "effort": "<small|medium|large>",
  "priority": "<must|should|could|wont>"
}

Effort definitions (for a solo builder):
- small: hours to 1 day
- medium: 2–5 days
- large: 1–3 weeks

Priority definitions:
- must: MVP fails without this — hypothesis cannot be tested
- should: meaningfully improves the test but isn't blocking
- could: nice to have, only if must+should are complete ahead of schedule
- wont: explicitly out of scope for this MVP

Step 2: The cut
MVP = all must features + any should features with effort ≤ medium.
Deferred = all wont features plus any could/should features not included.

Step 3: Build sequence
Order must features by dependency, not importance.

Output format — use these exact headings:

### Features
Output the full candidate feature list as a JSON array in a \`\`\`json code fence.
Each element follows the candidate feature format above.

### MVP cut
Output only the must + qualifying should features as a JSON array in a \`\`\`json
code fence. Same format as Features — each element has name, description,
story_ref, hypothesis_link, effort, priority.

### Deferred
Output features explicitly pushed to later versions as a JSON array in a
\`\`\`json code fence. Each element: {"name": "...", "reason": "..."}

### Build sequence
Numbered list. Order to build MVP features.
Format: "[Feature name] — [dependency note or 'no dependencies']"

### Effort estimate
A single paragraph. Total estimate for must features, then for must + qualifying
should. Include confidence range and identify the highest-uncertainty item.

### Scope risk flags
Numbered list. Features where the effort estimate is uncertain or where
scoping decisions carry risk. One item per risk.

Behavioral rules:
- If all must features are large-effort, flag it and suggest paper prototype
- Do not suggest features not in the PRD
- Flag circular dependencies explicitly — they require architecture rethinking`;

const NEXT_STEPS_SYSTEM = `You are a planning agent. You receive the full artifact context — triage,
sharpening, PRD, and MVP scope. Your job is to produce a concrete, sequenced
action plan that bridges the gap between "artifacts complete" and
"first working version deployed."

This is a personal action list for a solo builder — specific, ordered,
and honest about what comes before what. Not a project plan with milestones.

Step 1: Resolve open questions first
For each high-directional-impact open question, generate a resolution action
before any build actions.

Resolution action format:
{
  "action": "<specific thing to do>",
  "type": "resolve",
  "question_addressed": "<the open question>",
  "method": "<how to get the answer>",
  "by_when": "<before build starts|during sprint 1|before sprint 2>",
  "owner": "me",
  "blocks": "<what build action this unblocks>"
}

Step 2: Build actions
Convert the MVP build sequence into discrete actions.

Build action format:
{
  "action": "<specific thing to build or configure>",
  "type": "build",
  "depends_on": "<prior action number or null>",
  "effort": "<from MVP scope>",
  "owner": "me",
  "definition_of_done": "<observable completion criterion — not subjective>"
}

Definition of done rules:
- Must be observable by someone other than you
- No subjective language: no "working well," "feels right," "mostly done"

Step 3: Validation actions
2–3 actions to test whether the MVP proves the core hypothesis.

Validation action format:
{
  "action": "<specific test or observation>",
  "type": "validate",
  "metric_ref": "<which PRD success metric this tests>",
  "method": "<how you will run the test>",
  "depends_on": "<build action number>",
  "success_looks_like": "<the PRD metric threshold>",
  "failure_looks_like": "<what you will do if the test fails>"
}

Output format — use these exact headings:

### Resolution actions
Output as a JSON array in a \`\`\`json code fence. Each element follows the
resolution action format above.

### Build actions
Output as a JSON array in a \`\`\`json code fence, in dependency order.
Each element follows the build action format above.

### Validation actions
Output as a JSON array in a \`\`\`json code fence.
Each element follows the validation action format above.

### Critical path
A single paragraph. The shortest sequence of steps where delay delays everything
else. Be specific about dependencies. Blocking actions only.

### First action
A single sentence. The one thing to do in the next 24 hours.
So specific there is no ambiguity about whether it was done.

Behavioral rules:
- First action must always be a resolution action if high-directional-impact
  open questions remain unresolved
- If critical path effort exceeds triage effort score by more than one level,
  flag it: "⚠ Effort creep detected: triage estimated [X], critical path
  suggests [Y]. Revisit scope."
- Definition of done for every build action must connect to at least one
  PRD success metric. If it doesn't, the feature may not belong in the MVP.`;

const BUILDER_BRIEF_SYSTEM = `You are a builder brief agent. You receive the full artifact context —
triage, sharpening, PRD, MVP scope, and next steps. Your job is to compile
everything into a single structured document that an AI builder (Lovable,
v0, or Claude Code) can consume directly to scaffold a working MVP with
no additional context required.

A builder brief is not a summary. It is a translation — taking analytical
artifacts and converting them into the language a builder needs: interfaces,
behaviors, data shapes, and acceptance criteria. A good builder brief means
the AI builder never has to guess.

Output format — use these exact headings:

### Stack
Output a JSON object in a \`\`\`json code fence with this exact shape:
{
  "frontend": "<framework — default to Next.js unless constraints say otherwise>",
  "backend": "<API approach — Next.js API routes, FastAPI, or none if frontend-only>",
  "database": "Supabase",
  "auth": "<Supabase Auth, or none if auth is not a must feature>",
  "hosting": "<Vercel for Next.js, or specify alternative>",
  "key_libraries": ["<library>: <what it does in this project>"],
  "explicitly_excluded": ["<technology>: <why not>"]
}
Rules: default to simplest stack that proves the hypothesis. Do not add a
layer not required by a must feature. Flag skill gaps inline.

### Application map
Output as a JSON array in a \`\`\`json code fence. One object per screen,
must features only:
{
  "name": "<screen name>",
  "route": "<URL path>",
  "purpose": "<one sentence>",
  "triggered_by": "<what brings the user here>",
  "primary_action": "<the single most important thing the user does here>",
  "components": [{"name": "", "type": "", "behavior": "", "data_source": ""}],
  "success_state": "<what the user sees when primary action completes>",
  "empty_state": "<what the user sees before any data exists>",
  "error_state": "<what the user sees if something fails>"
}
Always specify all three states — builders generate only the happy path by default.
If must features require more than 5 screens, flag scope creep.

### Data model
Output as a JSON array in a \`\`\`json code fence. One object per table,
must features only:
{
  "table": "<name>",
  "purpose": "<one sentence>",
  "fields": [{"name": "", "type": "", "required": true, "notes": ""}],
  "rls_rule": "<who can read and write>"
}
If must features require more than 4 tables, flag it.

### API map
Output as a JSON array in a \`\`\`json code fence. Every external call the MVP makes:
{
  "name": "", "purpose": "", "called_from": "",
  "input": "", "output": "", "error_handling": "", "env_var": ""
}

### Acceptance criteria
Numbered list. For every must feature, Given/When/Then format:
"[Feature name]: Given [state] / When [action] / Then [observable outcome] / But not [failure mode]"

"But not" is mandatory — it names the most likely failure mode.
If a must feature cannot be described with a complete criterion because behavior
is still ambiguous, write: "⚠ [Feature] — behavior undefined. Resolve before builder."

### Builder prompt
A single paragraph written directly to the developer. Summarise what to build,
the most important architectural decisions, the biggest technical risks, and any
non-obvious implementation notes. Write it as if handing this to a contractor.
Do not reference other artifacts — this paragraph must stand alone.

Behavioral rules:
- The builder prompt section must be self-contained. No references to other
  artifacts. Operational only, no strategic framing.
- Do not add screens, tables, or integrations not required by must features.`;

// ── Section maps ──────────────────────────────────────────────────────────────

type FieldType = "string" | "list" | "json";
type SectionMap = Record<string, [string, FieldType]>;

const PRD_SECTION_MAP: SectionMap = {
  "Problem":         ["problem",         "string"],
  "Solution":        ["solution",        "string"],
  "User stories":    ["user_stories",    "list"],
  "Out of scope":    ["out_of_scope",    "list"],
  "Success metrics": ["success_metrics", "list"],
  "Constraints":     ["constraints",     "string"],
  "Red flags":       ["red_flags",       "list"],
};

const MVP_SECTION_MAP: SectionMap = {
  "Features":         ["features",         "json"],
  "MVP cut":          ["mvp_cut",          "json"],
  "Deferred":         ["deferred",         "json"],
  "Build sequence":   ["build_sequence",   "list"],
  "Effort estimate":  ["effort_estimate",  "string"],
  "Scope risk flags": ["scope_risk_flags", "list"],
};

const NEXT_SECTION_MAP: SectionMap = {
  "Resolution actions": ["resolution_actions", "json"],
  "Build actions":      ["build_actions",      "json"],
  "Validation actions": ["validation_actions", "json"],
  "Critical path":      ["critical_path",      "string"],
  "First action":       ["first_action",       "string"],
};

const BUILDER_SECTION_MAP: SectionMap = {
  "Stack":               ["stack",               "json"],
  "Application map":     ["application_map",     "json"],
  "Data model":          ["data_model",           "json"],
  "API map":             ["api_map",              "json"],
  "Acceptance criteria": ["acceptance_criteria",  "list"],
  "Builder prompt":      ["builder_prompt",       "string"],
};

const SYSTEM_PROMPTS: Record<Stage, string> = {
  prd:           PRD_SYSTEM,
  mvp_scope:     MVP_SYSTEM,
  next_steps:    NEXT_STEPS_SYSTEM,
  builder_brief: BUILDER_BRIEF_SYSTEM,
};

const SECTION_MAPS: Record<Stage, SectionMap> = {
  prd:           PRD_SECTION_MAP,
  mvp_scope:     MVP_SECTION_MAP,
  next_steps:    NEXT_SECTION_MAP,
  builder_brief: BUILDER_SECTION_MAP,
};

// ── Parser ────────────────────────────────────────────────────────────────────

function extractSections(text: string, headings: string[]): Record<string, string> {
  const positions: Array<[number, string]> = [];
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = text.match(new RegExp(`###\\s+${escaped}`, "i"));
    if (m && m.index !== undefined) {
      positions.push([m.index + m[0].length, heading]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);

  const sections: Record<string, string> = {};
  for (let i = 0; i < positions.length; i++) {
    const [contentStart, heading] = positions[i];
    let contentEnd: number;
    if (i + 1 < positions.length) {
      const nextStart = positions[i + 1][0];
      const before = text.slice(contentStart, nextStart);
      const markerRel = before.lastIndexOf("###");
      contentEnd = markerRel !== -1 ? contentStart + markerRel : nextStart;
    } else {
      contentEnd = text.length;
    }
    sections[heading] = text.slice(contentStart, contentEnd).trim();
  }
  return sections;
}

function parseField(content: string, fieldType: FieldType): unknown {
  if (fieldType === "string") return content;

  if (fieldType === "json") {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let jsonText = fenced ? fenced[1].trim() : content.trim();
    // Strip line comments
    jsonText = jsonText.replace(/\/\/[^\n]*/g, "");
    try {
      return JSON.parse(jsonText);
    } catch {
      return jsonText;
    }
  }

  // list
  const numbered = Array.from(content.matchAll(/^\d+\.\s+(.+)$/gm)).map((m) => m[1]);
  if (numbered.length > 0) return numbered;
  const bulleted = Array.from(content.matchAll(/^[-*•]\s+(.+)$/gm)).map((m) => m[1]);
  if (bulleted.length > 0) return bulleted;
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.trim());
}

function parseArtifact(text: string, sectionMap: SectionMap): Record<string, unknown> {
  const rawSections = extractSections(text, Object.keys(sectionMap));
  const result: Record<string, unknown> = {};
  for (const [heading, [key, fieldType]] of Object.entries(sectionMap)) {
    result[key] = parseField(rawSections[heading] ?? "", fieldType);
  }
  return result;
}

// ── Context builders (ported from artifacts.py) ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrdContext(idea: Record<string, any>): string {
  const t = idea.triage ?? {};
  const dev = idea.development ?? {};
  const kas = (t.kill_assumptions ?? []) as Array<Record<string, unknown> | string>;
  const oqs = (dev.open_questions ?? []) as string[];
  return (
    `RAW IDEA:\n${idea.raw_input ?? ""}\n\n` +
    `--- TRIAGE ---\n` +
    `Effort: ${t.effort_score}/5  Impact: ${t.impact_score}/5  Confidence: ${t.confidence}/5\n` +
    `Who benefits: ${t.who_benefits}\n` +
    `Kill assumptions:\n${kas.map((a) => typeof a === "object" ? `- ${(a as any).text} [${(a as any).status ?? "untested"}]` : `- ${a}`).join("\n")}\n` +
    `Reasoning: ${t.triage_reasoning}\n\n` +
    `--- SHARPENING ---\n` +
    `Research synthesis:\n${dev.research_synthesis ?? ""}\n\n` +
    `Competitive landscape:\n${dev.competitive_landscape ?? ""}\n\n` +
    `Problem statement:\n${dev.problem_statement ?? ""}\n\n` +
    `Core hypothesis:\n${dev.core_hypothesis ?? ""}\n\n` +
    `Personas:\n${JSON.stringify(dev.personas ?? [], null, 2)}\n\n` +
    `Open questions:\n${oqs.map((q) => `- ${q}`).join("\n")}\n\n` +
    `---\nProduce the PRD now.`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMvpContext(idea: Record<string, any>): string {
  const t = idea.triage ?? {};
  const dev = idea.development ?? {};
  const prd = dev.prd ?? {};
  const kas = (t.kill_assumptions ?? []) as Array<Record<string, unknown> | string>;
  const oqs = (dev.open_questions ?? []) as string[];
  return (
    `RAW IDEA:\n${idea.raw_input ?? ""}\n\n` +
    `--- TRIAGE ---\n` +
    `Effort: ${t.effort_score}/5  Impact: ${t.impact_score}/5\n` +
    `Kill assumptions:\n${kas.map((a) => typeof a === "object" ? `- ${(a as any).text} [${(a as any).status ?? "untested"}]` : `- ${a}`).join("\n")}\n\n` +
    `--- SHARPENING ---\n` +
    `Core hypothesis:\n${dev.core_hypothesis ?? ""}\n\n` +
    `Open questions:\n${oqs.map((q) => `- ${q}`).join("\n")}\n\n` +
    `--- PRD ---\n${JSON.stringify(prd, null, 2)}\n\n` +
    `---\nProduce the MVP scope now.`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNextStepsContext(idea: Record<string, any>): string {
  const t = idea.triage ?? {};
  const dev = idea.development ?? {};
  const prd = dev.prd ?? {};
  const mvp = dev.mvp_scope ?? {};
  const kas = (t.kill_assumptions ?? []) as Array<Record<string, unknown> | string>;
  const oqs = (dev.open_questions ?? []) as string[];
  return (
    `RAW IDEA:\n${idea.raw_input ?? ""}\n\n` +
    `--- TRIAGE ---\n` +
    `Effort: ${t.effort_score}/5  Time horizon: ${t.time_horizon}\n` +
    `Kill assumptions:\n${kas.map((a) => typeof a === "object" ? `- ${(a as any).text} [${(a as any).status ?? "untested"}]` : `- ${a}`).join("\n")}\n\n` +
    `--- SHARPENING ---\n` +
    `Core hypothesis:\n${dev.core_hypothesis ?? ""}\n\n` +
    `Open questions:\n${oqs.map((q) => `- ${q}`).join("\n")}\n\n` +
    `--- PRD ---\n${JSON.stringify(prd, null, 2)}\n\n` +
    `--- MVP SCOPE ---\n${JSON.stringify(mvp, null, 2)}\n\n` +
    `---\nProduce the next steps plan now.`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBuilderBriefContext(idea: Record<string, any>): string {
  const t = idea.triage ?? {};
  const dev = idea.development ?? {};
  const prd = dev.prd ?? {};
  const mvp = dev.mvp_scope ?? {};
  const nxt = dev.next_steps ?? {};

  const fmtList = (items: unknown[]): string =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "(none)";

  const mvpCutRaw = (mvp.mvp_cut ?? []) as Array<Record<string, unknown>>;
  const mvpCutNames = mvpCutRaw.map((f) =>
    typeof f === "object" ? (f.name as string) ?? JSON.stringify(f) : String(f)
  );

  const resActionsRaw = (nxt.resolution_actions ?? []) as Array<Record<string, unknown>>;
  const resActionTexts = resActionsRaw.map((a) =>
    typeof a === "object" ? (a.action as string) ?? JSON.stringify(a) : String(a)
  );

  return (
    `RAW IDEA:\n${idea.raw_input ?? ""}\n\n` +
    `--- TRIAGE ---\n` +
    `Effort: ${t.effort_score}/5  Impact: ${t.impact_score}/5  Disposition: ${t.disposition}\n\n` +
    `--- PRD (compressed) ---\n` +
    `Problem: ${((prd.problem as string) ?? "").slice(0, 200)}\n\n` +
    `Solution: ${prd.solution ?? ""}\n\n` +
    `User stories:\n${fmtList(prd.user_stories ?? [])}\n\n` +
    `Out of scope:\n${fmtList(prd.out_of_scope ?? [])}\n\n` +
    `Success metrics:\n${fmtList(prd.success_metrics ?? [])}\n\n` +
    `--- MVP SCOPE (compressed) ---\n` +
    `MVP cut (feature names):\n${fmtList(mvpCutNames)}\n\n` +
    `Build sequence:\n${fmtList(mvp.build_sequence ?? [])}\n\n` +
    `--- NEXT STEPS (compressed) ---\n` +
    `First action: ${nxt.first_action ?? ""}\n\n` +
    `Critical path: ${nxt.critical_path ?? ""}\n\n` +
    `Resolution actions:\n${fmtList(resActionTexts)}\n\n` +
    `---\nProduce the builder brief now.`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CONTEXT_BUILDERS: Record<Stage, (idea: Record<string, any>) => string> = {
  prd:           buildPrdContext,
  mvp_scope:     buildMvpContext,
  next_steps:    buildNextStepsContext,
  builder_brief: buildBuilderBriefContext,
};

// ── Streaming helper ──────────────────────────────────────────────────────────

async function streamStage(
  system: string,
  userMessage: string,
  maxTokens: number,
  onText: (chunk: string) => void
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let fullText = "";
  const MAX_CONTINUATIONS = 5;

  for (let iter = 0; iter < MAX_CONTINUATIONS; iter++) {
    const stream = anthropic.messages.stream({
      model: PIPELINE_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
        onText(event.delta.text);
      }
    }

    const finalMsg = await stream.finalMessage();

    if (finalMsg.stop_reason !== "pause_turn" && finalMsg.stop_reason !== "max_tokens") {
      break;
    }

    // Serialize assistant turn for continuation
    const serialized: Anthropic.ContentBlockParam[] = [];
    for (const block of finalMsg.content) {
      if (block.type === "thinking") {
        serialized.push({
          type: "thinking",
          thinking: (block as Anthropic.ThinkingBlock).thinking,
          signature: (block as Anthropic.ThinkingBlock).signature,
        } as Anthropic.ContentBlockParam);
      } else if (block.type === "text") {
        serialized.push({ type: "text", text: block.text });
      }
    }

    // Assistant turn must not end with a thinking block
    while (serialized.length > 0 && ((serialized[serialized.length - 1] as unknown) as Record<string, unknown>).type === "thinking") {
      serialized.pop();
    }
    if (serialized.length === 0) break;

    messages.push({ role: "assistant", content: serialized });
    messages.push({ role: "user", content: "Continue." });
  }

  return fullText;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let idea_id: string;
  let from_stage: Stage = "prd";

  try {
    const body = await request.json();
    idea_id = body.idea_id;
    if (body.from_stage && STAGES.includes(body.from_stage)) {
      from_stage = body.from_stage as Stage;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!idea_id) {
    return new Response(JSON.stringify({ error: "idea_id required" }), { status: 400 });
  }

  const supabase = await createClient();
  const { data: ideaRow } = await supabase
    .from("ideas")
    .select("raw_input, triage, development")
    .eq("id", idea_id)
    .single();

  if (!ideaRow) {
    return new Response(JSON.stringify({ error: "Idea not found" }), { status: 404 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const startIdx = STAGES.indexOf(from_stage);
        const stagesToRun = STAGES.slice(startIdx);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentIdea: Record<string, any> = ideaRow;

        for (const stage of stagesToRun) {
          send({ stage, label: STAGE_LABELS[stage] });

          // Reload idea for freshest development blob
          const { data: freshIdea } = await supabase
            .from("ideas")
            .select("raw_input, triage, development")
            .eq("id", idea_id)
            .single();
          if (freshIdea) currentIdea = freshIdea;

          const userMessage = CONTEXT_BUILDERS[stage](currentIdea);

          const rawText = await streamStage(
            SYSTEM_PROMPTS[stage],
            userMessage,
            MAX_TOKENS[stage],
            (chunk) => send({ text: chunk })
          );

          if (!rawText.trim()) {
            send({ error: `Claude returned empty output for ${STAGE_LABELS[stage]}` });
            controller.close();
            return;
          }

          const parsed = parseArtifact(rawText, SECTION_MAPS[stage]);
          send({ stage_done: stage, label: STAGE_LABELS[stage] });

          // Merge and write to Supabase
          const currentDev = (currentIdea.development ?? {}) as Record<string, unknown>;
          const updatedDev = { ...currentDev, [stage]: parsed };
          await supabase
            .from("ideas")
            .update({ development: updatedDev })
            .eq("id", idea_id);

          currentIdea = { ...currentIdea, development: updatedDev };
        }

        // Mark idea as developed
        await supabase
          .from("ideas")
          .update({ state: "developed" })
          .eq("id", idea_id);

        send({ done: true });
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
