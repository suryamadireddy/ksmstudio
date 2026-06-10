Portfolio Editing Workspace — Build Spec
Implementation spec for Cursor. Execute top-to-bottom with verification checkpoints. Pause after each numbered section. Do not proceed until the checkpoint for the current section passes.
This build was previously labeled "Phase 5" in conversation. It is not the original Phase 5 of the KSM Studio roadmap (which is Deployment, still ahead). It is a scope addition that emerged from real need: published pages exist and need a proper tuning surface. For historical continuity with internal documents, treat this as "Phase 4.5" — sitting between Public Portfolio (Phase 4, complete) and Deployment (original Phase 5, not yet started).

Context
Phase 4 shipped a working distillation pipeline and public portfolio. The studio's "Portfolio" tab currently offers a generate → preview → approve flow. That flow is enough to ship a page, not enough to tune one.
This build replaces that tab with a true editing workspace. Two editing channels share one live preview and one working version:

Instant toolbar — schema-level edits to the presentation spec. No LLM call. Accent color, layout template, section order, section visibility, signature drag and resize.
Chat with the idea — content-level edits routed to distillation. Rewrites, register shifts, narrative changes.

This is the two-speed editing model: touch is fast, AI is slower. Both surfaces are visible simultaneously. The user always knows which path they're on.
Principles

Preserve Phase 4's infrastructure. Distillation passes, archetype library, signature library, chat runtime, versioning — all unchanged. This build adds a workspace on top.
Working draft + autosnapshots. One editing version exists at a time. Changes are non-destructive. Explicit save creates a proper version; 5-minute autosaves create implicit snapshots.
Layout templates are a new axis of composition. Distillation now picks a layout template in addition to archetypes, weights, and ordering.
Wildcard is deferred. Three templates ship: Clean, Showcase, Aesthetic. Wildcard is v2.
Side-by-side version comparison is deferred. v2.
Real-time conversation + drag sync is deferred. v1 is async; each action completes before the next begins. v2/v3 revisit this.
Master-agent forward-compatibility. All new data structures (working drafts, snapshots, workspace conversations, edit proposals) remain queryable. The eventual master agent will read these to understand how each idea's presentation has evolved. Do not hide them behind abstractions.

Out of scope for this build

Wildcard layout template
Side-by-side version comparison / diffing
Real-time synchronous drag-plus-chat
Dual-window (studio + public page as separate windows with live master-agent orchestration)
Intent-routing unified chat (chat that auto-routes between instant and distillation edits)
Full bespoke signature components (placeholder-level signatures only for now)
Multi-user collaboration or presence
Public-facing edits (visitors cannot edit)

Architecture Overview
┌─ Studio — Workspace tab (replaces Portfolio tab) ─────────────────┐
│ │
│ ┌─ Top bar: version selector + save controls ─────────────────┐ │
│ │ [working draft ▾] [Save as version] [History] [Publish] │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ │
│ ┌─ Left pane ──────────────────┐ ┌─ Right pane ──────────────┐ │
│ │ │ │ │ │
│ │ Live preview │ │ Toolbar (top) │ │
│ │ (PortfolioRender wrapped │ │ - Layout template picker │ │
│ │ in EditLayer when in │ │ - Accent color picker │ │
│ │ workspace) │ │ - Section reorder │ │
│ │ │ │ - Section visibility │ │
│ │ EditLayer handles drag, │ │ - Signature placement │ │
│ │ resize, selection — NOT │ │ │ │
│ │ the template itself. │ │ Chat with idea (below) │ │
│ │ │ │ - Streams distillation │ │
│ │ │ │ edits into the draft │ │
│ │ │ │ │ │
│ └──────────────────────────────┘ └───────────────────────────┘ │
│ │
└────────────────────────────────────────────────────────────────────┘

1. Data Model Changes
   Single migration. Additive only — no existing data changes shape.
   1.1 New PortfolioVersion.status value
   Extend the existing enum in web/lib/types.ts:
   tsstatus: "active" | "archived" | "draft" | "working_draft";
   Only one version per idea may have status: "working_draft" at a time. It is the mutable canvas the workspace edits against.
   1.2 New PortfolioVersion field
   Add to PortfolioVersion:
   tssnapshots: WorkingDraftSnapshot[]; // present only on working_draft versions, else []
   tsexport interface WorkingDraftSnapshot {
   id: string; // uuid
   created_at: string; // iso
   trigger: "autosave" | "before_distillation" | "explicit";
   presentation: PresentationSpec;
   public_summary: { sections: RenderedSection[] };
   chatbot_context: ChatbotContext;
   voice: { summary: string; sample_lines: string[] };
   }
   Snapshots are created by autosave (every 5 minutes of active editing), before every distillation pass (so regeneration is rollback-able), and on explicit save. The working draft holds its current state at the top level; snapshots are its history.
   Snapshot cap: working drafts retain the last 20 snapshots maximum. Older snapshots are evicted FIFO. This prevents unbounded JSONB growth during heavy edit sessions. The cap applies at write time — when a new snapshot would exceed 20, the oldest is removed atomically in the same update.
   1.3 PresentationSpec additions
   Add a layout template field:
   tsexport type LayoutTemplate = "clean" | "showcase" | "aesthetic";

export interface PresentationSpec {
accent_color: AccentColor;
accent_color_rationale: string;
visual_register: VisualRegister;
visual_register_rationale: string;
layout_template: LayoutTemplate; // NEW
layout_template_rationale: string; // NEW
sections: PresentationSection[];
signature_element: SignatureElement;
signature_placement?: SignaturePlacement; // NEW — defaults apply if absent
}
tsexport interface SignaturePlacement {
mode: "inline" | "fixed_side" | "fixed_hero" | "floating";
// inline: signature renders as a section in the normal flow at the position
// given by presentation.sections[signature_element.placement]
// fixed_side: signature pinned to left or right, content flows beside
// (primarily used by showcase template)
// fixed_hero: signature occupies the top viewport on load
// (primarily used by aesthetic template)
// floating: signature is draggable/resizable, position stored below
side?: "left" | "right";
x_pct?: number; // 0-100, only when mode=floating, percent from left
y_pct?: number; // 0-100, only when mode=floating, percent from top
width_pct?: number; // 20-80, only when mode=floating
height_pct?: number; // 20-80, only when mode=floating
}
When a template is clean or showcase, signature_placement is set by the template's conventions (inline for clean, fixed_side for showcase). When the user drags the signature in the workspace, signature_placement is set to floating with explicit coordinates and the template's automatic placement is overridden. User can return to template defaults via a "Reset to template default" button.
1.4 Migration SQL
Write to run-in-supabase.sql:
sql-- Portfolio Editing Workspace: additive portfolio additions.
-- No schema migration needed — all changes are inside the portfolio JSONB.
-- This file documents the additions for future-proofing.

-- Backfill: any existing versions get layout_template = "clean" as default
-- since pre-workspace versions were rendered as single-column vertical stacks,
-- which Clean most closely matches.
UPDATE ideas
SET portfolio = jsonb_set(
portfolio,
'{versions}',
(
SELECT jsonb_agg(
CASE
WHEN v->'presentation' IS NOT NULL
AND v->'presentation'->>'layout_template' IS NULL
THEN jsonb_set(
v,
'{presentation,layout_template}',
'"clean"'
)
ELSE v
END
)
FROM jsonb_array_elements(portfolio->'versions') v
)
)
WHERE portfolio IS NOT NULL
AND portfolio->'versions' IS NOT NULL;

-- Backfill: default layout_template_rationale on backfilled versions.
UPDATE ideas
SET portfolio = jsonb_set(
portfolio,
'{versions}',
(
SELECT jsonb_agg(
CASE
WHEN v->'presentation' IS NOT NULL
AND v->'presentation'->>'layout_template_rationale' IS NULL
THEN jsonb_set(
v,
'{presentation,layout_template_rationale}',
'"Pre-workspace version — defaulted to Clean."'
)
ELSE v
END
)
FROM jsonb_array_elements(portfolio->'versions') v
)
)
WHERE portfolio IS NOT NULL
AND portfolio->'versions' IS NOT NULL;
Checkpoint 1
Run the migration in Supabase SQL Editor. Verify:
sqlSELECT
id,
portfolio->'active_version_id' AS active_id,
jsonb_array_length(portfolio->'versions') AS version_count,
portfolio->'versions'->0->'presentation'->>'layout_template' AS first_version_template
FROM ideas
WHERE published = true;
Expect: every published idea has all its versions defaulted to clean, version counts unchanged.

2. Layout Template System
   Each template is a pure React component that wraps the archetype-rendered sections and arranges them spatially. Templates receive a version and render it. Templates do NOT know about editing state.
   Edit-mode concerns (drag, resize, selection, overlays) are handled by a separate EditLayer component that wraps the template in the workspace. On the public page, the template is rendered without EditLayer.
   2.1 Template components
   Create web/components/portfolio/templates/:

CleanTemplate.tsx
ShowcaseTemplate.tsx
AestheticTemplate.tsx
index.ts — exports TEMPLATE_REGISTRY: Record<LayoutTemplate, React.FC<TemplateProps>>

2.2 Template props
Pure. No edit concerns.
tsexport interface TemplateProps {
version: PortfolioVersion;
signaturePlacement: SignaturePlacement;
}
2.3 EditLayer component
Separate from templates. Lives in web/components/portfolio/EditLayer.tsx.
tsexport interface EditLayerProps {
children: React.ReactNode; // the rendered template
version: PortfolioVersion;
onSignatureMove?: (placement: SignaturePlacement) => void;
onSectionSelect?: (sectionIndex: number) => void;
signaturePlacementOverride?: SignaturePlacement;
}
EditLayer:

Renders children (the template output) in a relative-positioned container
Listens for drag events on the signature element (identified by a stable DOM selector like [data-signature-slot])
Shows resize handles on drag-start, commits on drag-end
Overlays a thin outline and hover state on sections when hovered
When signaturePlacementOverride is present, it positions the signature element via absolute positioning or transform — without mutating the template's DOM

This separation keeps templates stable when adding future edit affordances (e.g., section-level resize handles) and lets the public page render templates unwrapped.
2.4 Clean template
Mood: clean, simple, pure. Confidence through restraint.

Single column, max content width max-w-2xl (narrower than other templates)
Generous vertical spacing: space-y-24 between sections minimum
Hero statement at large scale, all other sections restrained
No decorative elements, no background treatments
Signature placement defaults to inline at the position specified by the presentation
Typography: serif-forward for all headings, body text is generous line-height and measured column
Everything aligned to a single column

tsxexport function CleanTemplate({ version }: TemplateProps) {
const { presentation, public_summary } = version;
const visibleSections = public_summary.sections.filter(s => !s.hidden);
return (
<article
      data-accent={presentation.accent_color}
      data-register={presentation.visual_register}
      data-template="clean"
      className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
    >
<div className="mx-auto max-w-2xl px-6 py-32 space-y-24">
{visibleSections.map((section, idx) => {
const Component = ARCHETYPE_REGISTRY[section.archetype];
return <Component key={idx} {...section.content} />;
})}
</div>
</article>
);
}
2.5 Showcase template
Mood: makes the why easy. The signature IS the argument.

Two-column layout at desktop, single column at mobile
Signature pinned to one side (default right) at fixed position, stays visible as content scrolls past it until the end of the article
Content column is narrow (max-w-xl), sits beside the signature
Mobile: signature renders at top, content flows below
Below the main split, sections after signature_placement.placement_index + n render full-width
Typography: mixed, with a subtle emphasis on captions (mono for metadata, serif for headings)

2.6 Aesthetic template
Mood: makes you gasp. Designed to stop the visitor.

Hero zone: full-viewport on load (h-screen), dramatic typography scale, one element centered
Below the hero: asymmetric grid. Sections alternate between full-width and 2/3-width, with occasional oversized pull quotes in the remaining 1/3
More vertical space between groups of sections than within groups
Typography: ambitious scale. Hero statement at text-7xl or larger desktop, generous tracking
Suggested motion: hero stays while the page scrolls once, then releases; subsequent sections fade-in on scroll
Signature placement: defaults to fixed_hero — signature occupies the hero zone. If the version's signature is a visual-only placeholder, this template shines

2.7 PortfolioRender dispatches to templates
Update web/components/portfolio/PortfolioRender.tsx:
tsxexport function PortfolioRender({
version,
editMode,
onSignatureMove,
signaturePlacementOverride,
}: {
version: PortfolioVersion;
editMode?: boolean;
onSignatureMove?: (placement: SignaturePlacement) => void;
signaturePlacementOverride?: SignaturePlacement;
}) {
const template = version.presentation.layout_template ?? "clean";
const Template = TEMPLATE_REGISTRY[template] ?? CleanTemplate;
const placement = signaturePlacementOverride
?? version.presentation.signature_placement
?? defaultPlacementFor(template);

const rendered = <Template version={version} signaturePlacement={placement} />;

if (editMode) {
return (
<EditLayer
        version={version}
        onSignatureMove={onSignatureMove}
        signaturePlacementOverride={signaturePlacementOverride}
      >
{rendered}
</EditLayer>
);
}

return rendered;
}

function defaultPlacementFor(template: LayoutTemplate): SignaturePlacement {
switch (template) {
case "clean": return { mode: "inline" };
case "showcase": return { mode: "fixed_side", side: "right" };
case "aesthetic": return { mode: "fixed_hero" };
}
}
Checkpoint 2

Create placeholder versions of all three templates AND the EditLayer. Each template should compile, render the archetype sections, filter hidden sections, and visually differ from each other enough that switching templates is obviously different.
Verify the public page (no editMode) renders without EditLayer overhead.
Manually set a published idea's active version's presentation.layout_template to "showcase" via Supabase MCP. Reload the public page — it should render with a right-side signature and content flowing to the left.
Set it to "aesthetic". Reload. Full-viewport hero, asymmetric below.
Set it back to "clean". Reload. Single column, centered, restrained.
No layout bugs, no broken responsive behavior at mobile widths (≤ 768px).

3. Distillation Updates
   The character and content passes don't change. The presentation pass gets a new axis: layout_template.
   3.1 Pass 2 (Presentation) prompt additions
   In distill.py's PRESENTATION_SYSTEM_PROMPT, after the archetype library section, add:
   text## The layout template

You also pick a layout template that determines the spatial character
of the page. You have three options:

### clean

Mood: clean, simple, pure. Single column, generous whitespace.
Confidence through restraint. Nothing needs decoration. The content
is the whole point. Best for: ideas whose strength is clarity of
thought, ideas at early stages, ideas where quiet presentation
respects the subject.

### showcase

Mood: makes the why easy. Two-column layout: the signature element
pins to one side while the content explains beside it. The visitor
sees the thing and understands the thing in the same moment. Best
for: ideas with a strong visual or interactive signature that IS
the argument, ideas whose domain is inherently visual, ideas where
the physical object or artifact is the strongest communication.

### aesthetic

Mood: makes the visitor gasp. Full-viewport hero on open, asymmetric
grid below. Ambitious typography. Designed to stop you. Best for:
ideas whose character is dramatic or formative, ideas with a
compelling first impression, ideas where emotional response matters
as much as understanding.

You must pick exactly one. Justify in one sentence (layout_template_rationale).
Base your choice on the character card and the nature of the idea,
not on what would make the page "impressive." A quiet idea gets
clean. A bold idea gets aesthetic. Not the other way around.

If the user's creative brief contradicts your template choice, follow
the brief but note the tension in your rationale.
3.2 New output field
PresentationSpec output now includes layout_template and layout_template_rationale. Update the tool schema to match the TypeScript type from Section 1.3.
3.3 Signature placement is NOT picked by distillation
Distillation picks the template. The template picks the default signature placement (clean → inline, showcase → fixed_side right, aesthetic → fixed_hero). The user overrides to floating by dragging. This split keeps distillation focused on idea-level decisions and gives the user direct control over spatial taste.
Checkpoint 3

Update distill.py.
Run python distill.py [published_idea_id] --mode full_regen --brief "Try an aesthetic, dramatic layout" — should produce a version with layout_template: "aesthetic".
Run again with --brief "Lean restrained. Let the content speak." — should produce layout_template: "clean".
Do NOT promote the test versions to active; archive them after inspection. They're smoke tests, not intended content.

4. Working Draft System
   4.1 Lifecycle

User opens the Workspace tab for an idea with no working draft → "Start editing" button creates a working draft branched from the currently-active version.
User edits via toolbar or chat → changes modify the working draft in place.
Every 5 minutes of active editing → autosnapshot appended to working_draft.snapshots[] (subject to 20-snapshot cap, FIFO eviction).
User clicks "Save as version" → working draft's current state is copied to a new status: "draft" version. Working draft remains open for further editing.
User clicks "Publish" (from a saved version) → that version becomes active, previous active becomes archived.
User explicitly discards the working draft → working draft and its snapshots are deleted.

Only one working draft per idea at any time. Opening the Workspace while one exists resumes editing it.
4.2 Initial generation (empty-state reuse of Phase 4 flow)
If an idea has no versions at all, the Workspace tab's empty state reuses the Phase 4 generate-approve-discard flow, embedded directly. Specifically:

The empty state renders the existing creative brief input and "Generate" button from Phase 4
On generation, the new version is created as normal (status: draft), then immediately promoted to active
After promotion, the workspace automatically branches a working_draft from the new active version
User is now in the normal editing state

This is not a new UI. It's the Phase 4 flow rendered as an empty state. Reuse the existing component.
4.3 API routes
New routes under web/app/api/studio/ideas/[id]/workspace/:

POST .../open — creates a working draft from the active version if none exists; returns the working draft id. If no active version exists, returns a 409 with needs_initial_generation: true so the UI knows to show the empty-state generate flow.
POST .../snapshot — creates an autosnapshot; body { trigger: "autosave" | "explicit" }. Server applies 20-cap FIFO eviction atomically. No-ops if content unchanged since last snapshot.
PATCH .../update — applies instant edits to the working draft. Body is a partial PortfolioVersion. Only presentation-level fields are accepted here (accent, layout_template, signature_placement, section order, section visibility). Body shape validated server-side against a whitelist.
POST .../chat — routes a chat message to distillation. Body { message: string }. Server:

Loads the working draft's current state
Creates a before_distillation snapshot
Runs distill.py in mode determined by edit action (see section 5.3 routing table)
Streams progress back to the UI
On completion, updates the working draft with the new presentation + content

POST .../save-as-version — copies working draft state into a new status: "draft" version.
POST .../discard — deletes working draft.
POST .../revert-to-snapshot — body { snapshot_id: string }. Copies the snapshot's content back into the working draft's top-level fields. Other snapshots remain.
GET .../distillation-status — returns { status: "idle" | "running" | "failed", last_attempt_at: string, error?: string }. Called on workspace open to detect interrupted runs.

4.4 Interrupted distillation handling
If the user closes the tab mid-distillation, the server run continues (fire and forget) and writes results to the working draft when complete. On next workspace open:

UI calls GET .../distillation-status
If status === "running", show a non-blocking banner: "Still refining your last edit. This will update when done." Subscribe to the status endpoint via polling (every 3s) until status changes.
If status === "failed", show: "Your last edit didn't land. Your draft is unchanged from before that attempt. Try again?" with retry affordance.
If status === "idle", proceed normally.

4.5 Section ordering via drag
Sections are reordered by toolbar (drag handles in a list UI, not on the preview). The preview reflects order changes instantly. This is an instant edit (no LLM).
4.6 Section visibility toggles
Each section in the toolbar has a visibility toggle. Hidden sections are retained in the presentation spec but marked with a hidden: true field and skipped by the renderer. This preserves distillation's original composition while letting the user trim.
Add to PresentationSection:
tsexport interface PresentationSection {
archetype: Archetype;
weight: SectionWeight;
purpose: ConceptualTerritory[];
content_brief: string;
notes?: string;
hidden?: boolean; // NEW
}
Template components filter out hidden sections before rendering.
Checkpoint 4

Implement open, snapshot, update, save-as-version, discard, revert-to-snapshot, and distillation-status routes.
In the Supabase SQL editor, verify that opening a workspace creates exactly one working_draft version and that explicit "Save as version" creates a new draft-status version.
Verify the 20-snapshot cap enforces FIFO eviction: write 25 snapshots in sequence, confirm only the latest 20 remain in order.
Verify revert-to-snapshot restores content without deleting other snapshots.
Discarding the working draft removes it from the versions array without affecting other versions.
Run the chat route test in Section 5 after the chat pane is built.

5. Chat Integration with Editing
   5.1 Chat in the workspace is different from the public chat
   The public /api/projects/[slug]/chat is the idea talking to a visitor. It answers questions and represents the idea. The workspace chat is the idea talking to its creator about its own presentation. Different system prompt, different context.
   Critical isolation requirement: The public chatbot must never read workspace conversations when building its conversation history. The public chat route's buildSystemPrompt or equivalent context loader must filter conversations to context = 'portfolio_public' only. Workspace conversations use context = 'workspace_edit' and must be invisible to the public layer. Verify this in Checkpoint 5.
   5.2 Workspace chat system prompt
   Compose from:

The character card (identity, voice_dna, posture) — so the idea still sounds like itself
The current presentation spec — so the idea knows how it's currently presented
An editor-collaboration layer — explicit instructions that this chat can make changes to the presentation, how to do it, and what's permitted

Skeleton (in web/lib/portfolio/compose-workspace-chat-prompt.ts):
textYou are the idea, talking with your creator about how you present
yourself publicly. Not a visitor — your creator, in their studio.

## Who you are (voice layer)

[identity_statement]

Voice: [voice_dna summary]

## How you're currently presented

Layout template: [layout_template]
Accent color: [accent_color]
Visual register: [visual_register]
Sections (in order): [section list with archetype, weight, hidden?]
Signature placement: [signature_placement]

## What this conversation is for

Your creator wants to refine how you present yourself. They may ask
you to make changes. You respond in character, but you can also
propose changes to your own presentation.

When the conversation touches on things you can change, respond with
a natural reply THEN append a structured edit proposal:

PROPOSED EDIT:
action: <one of: rewrite_section, change_register, add_section,
remove_section, regenerate_content, full_refresh>
target: <section identifier if applicable, else null>
brief: <a short instruction your distillation passes can act on>

You do NOT make edits directly. You propose. The creator's studio
shows them the proposal and they accept or reject it.

## What you cannot do in this chat

- You cannot change your core character or identity. Your creator
  must go through a full regeneration for that.
- You cannot change safety refusals or security-layer refusals.
- You cannot add or edit outcomes, journal entries, or private data.

## Conversational style

Same voice as always, but you are unusually self-aware here. You can
notice your own pacing, acknowledge when a section feels long,
suggest when you're being repetitive. Keep responses brief unless the
creator asks for depth.
5.3 Chat routes edits to distillation — action-to-mode routing table
When a chat response contains a PROPOSED EDIT, the workspace routes to distillation based on the action:
ActionDistillation modeScoperewrite_sectiondefaultContent pass runs; presentation unchangedchange_registerpresentation_onlyPresentation pass only; register + possibly color/layoutadd_sectiondefaultContent pass adds a section; presentation updates structureremove_sectionpresentation_onlyPresentation pass drops a sectionregenerate_contentdefaultContent pass full regen; presentation preservedfull_refreshfull_regenAll passes rerun; character preserved, presentation and content rebuilt
The mode is determined server-side by mapping the action. The client never specifies mode.
5.4 Accept / reject flow
When a chat response contains a PROPOSED EDIT, the workspace:

Shows the edit to the user inline in the chat ("I want to shorten my opening — should I?") with Accept / Reject buttons
On Accept:

Snapshot the working draft (trigger: "before_distillation")
Call distill.py with the brief and the mode from the routing table
Stream results back
Replace the working draft's relevant fields with the new output

On Reject: nothing changes. The proposal is dismissed.

This is the idea-initiated edit flow. User-initiated direct edits (typing instructions without a proposal) are deferred — v1 uses only idea-initiated.
Checkpoint 5

Workspace chat streams in-character responses.
Asking the idea to "shorten the opening" produces a PROPOSED EDIT block visible in the UI.
Accept triggers a distillation run with the right brief and correct mode per the routing table.
Reject dismisses without changes.
The before_distillation snapshot appears in the working draft's snapshots array.
Public chatbot isolation verified: open the public chat for the same idea, inspect the system prompt or context it loads. Confirm no workspace_edit conversations appear. Test with SQL: SELECT context FROM conversations WHERE idea_id = '...' — public chat should ignore workspace_edit rows.

6. Workspace UI
   6.1 Replace the Portfolio tab
   In web/app/(studio)/studio/ideas/[id]/\_components/IdeaDetailShell.tsx:

Rename PortfolioTab → WorkspaceTab and update the import
Rename the tab id from "portfolio" to "workspace"
Rename the label from "Portfolio" to "Workspace"
Keep the requiresDev: true gate

Archive the old PortfolioTab.tsx — rename to PortfolioTab.legacy.tsx and stop importing it. Don't delete; useful reference.
6.2 Layout
WorkspaceTab.tsx is a two-pane layout:

Top bar (full width, ~48px tall)
Left pane (flex-1): live preview rendered by PortfolioRender with editMode={true}, which wraps the template in EditLayer
Right pane (fixed width ~400px desktop, full width on mobile): toolbar at top, chat below

Responsive behavior at < 1024px: stack the panes vertically, preview on top, toolbar + chat below.
6.3 Top bar
Left to right:

Idea title + a version selector ("Working draft", or name of a saved draft/active). When the user is on a saved version, they can't edit it directly — a button "Branch to working draft" reopens editing.
Progress indicator: "Saved just now" / "Autosaving..." / "Distillation running..." / "Recovering from interrupted edit..."
Button: "Save as version" — prompts for an optional name
Button: "History" — opens the History panel (see 6.4)
Button: "Publish" — only visible when a saved version is selected; promotes it to active

6.4 History panel
Opens as a right-side drawer or modal from the History button. Two sections:
Versions (top)

List of all non-working-draft versions, newest first
Each row: name (or generated label like "Draft — April 17"), status badge (active, draft, archived), created timestamp
Click a row: preview loads that version (read-only)
Actions per row: Promote to active (for drafts/archived), Branch to working draft (replaces current working draft with a copy of this version), Archive

Working draft snapshots (bottom, collapsible)

List of snapshots on the current working draft, newest first
Each row: trigger label (autosave / before_distillation / explicit), timestamp, optional brief summary of what changed if derivable
Click a row: preview loads that snapshot's content
Action per row: Revert working draft to this snapshot
Reverting doesn't delete other snapshots — it copies the snapshot's content to the working draft's top level. You can still revert further back if needed.

Navigation between versions and snapshots shares the main preview pane.
6.5 Toolbar (right pane top)
Grouped controls:
Template

Segmented toggle: Clean / Showcase / Aesthetic
Hover description of each
Selecting triggers a PATCH .../update with new layout_template. No snapshot — template change is trivial.

Accent

Six color swatches (amber, deep_teal, ember_red, sage, indigo, terracotta)
Click to apply

Sections

List of sections with drag handles, archetype labels, weight indicators, eye icon (visibility toggle)
Drag to reorder; eye icon to hide
Separate visual treatment for the signature_slot section (it can't be hidden, only repositioned)

Signature

Button: "Place signature..."
Clicking it puts the preview into placement mode: cursor changes, overlay appears with instructions "Drag the signature on the preview to reposition. Drag corner to resize."
Signature shows resize handles and is draggable only when in placement mode
Drag commits on mouseup as a PATCH .../update with new signature_placement in floating mode
Button: "Reset to template default" — returns signature_placement to undefined so the template's default applies

6.6 Chat (right pane bottom)
Standard chat UI:

Message thread scrolls independently of toolbar
Input at bottom
In-thread inline edit proposals rendered as cards with Accept/Reject buttons
Streaming indicator when distillation is running

Chat conversation is persisted to conversations table with context: "workspace_edit". Each message saved to messages as usual. This conversation is private — never surfaced to public page or portfolio_public chat.
6.7 Autosave
A single useEffect in WorkspaceTab.tsx:
tsxuseEffect(() => {
if (!workingDraftId) return;
const interval = setInterval(() => {
fetch(`/api/studio/ideas/${ideaId}/workspace/snapshot`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ trigger: "autosave" }),
});
}, 5 _ 60 _ 1000);
return () => clearInterval(interval);
}, [workingDraftId, ideaId]);
Only runs when the workspace is mounted and there's an active working draft. Server-side: the snapshot route no-ops if the working draft hasn't changed since the last snapshot (compare deep-equality of presentation + public_summary + chatbot_context). The 20-snapshot cap applies at write time.
6.8 Error handling

If distillation fails mid-chat-edit, the working draft is restored from the before_distillation snapshot and the UI shows: "Edit didn't land. Your draft is unchanged. Try again?"
If an instant edit PATCH fails, the optimistic UI state is rolled back and an inline toast surfaces the error. Don't surface technical errors — surface "That change didn't save. Try again?"
Interrupted distillation handling per Section 4.4.
If the user has no active version yet (no distillation ever run), show the Phase 4 empty-state generate flow embedded in the Workspace tab per Section 4.2.

Checkpoint 6
Full end-to-end flow on a published idea:

Open the idea's workspace. Preview renders live with existing active version.
Change template to Showcase. Preview updates instantly, signature moves to right side.
Change accent color to sage. Updates instantly.
Drag the signature to floating in a specific spot. Updates instantly.
Hide a middle section. Updates instantly.
Chat: "shorten my opening statement." Idea proposes an edit. Accept. Distillation runs (progress shown). Opening updates.
Open History panel. See the autosave snapshots and the before_distillation snapshot.
Revert working draft to an earlier snapshot. Preview updates. Other snapshots still present.
Save as version. A new draft appears in version history.
Discard working draft. Working draft disappears; saved version remains.
Open workspace again. Empty workspace state since no working draft. Click "Edit this version." New working draft created from the saved version.
Simulate interrupted distillation: start a chat edit, close the tab mid-run (in dev, kill the request). Reopen. Banner should show recovery state.

All twelve steps should work without reloads or manual refreshes.

7. Verification — Workspace Build Complete
   All of the following must pass before this build is considered shipped:

Migration ran; existing versions have layout_template: "clean" backfilled
All three templates render distinctly and correctly (visual inspection)
Templates are responsive at 375px, 768px, 1024px, 1440px widths
EditLayer correctly handles drag/resize without mutating template DOM
Public page renders templates without EditLayer overhead
Distillation picks appropriate templates based on character + brief
Creating a working draft preserves the source version unchanged
Autosnapshots fire every 5 minutes during active editing
Snapshot cap enforces FIFO eviction at 20 snapshots
Instant edits (template, accent, section reorder, visibility, signature drag) all feel instant (< 200ms from UI action to preview update)
Chat with the idea in workspace is in-character
Chat proposed edits include a valid PROPOSED EDIT block
Accept edit runs distillation in the correct mode per routing table
Reject edit does not modify the draft
Before-distillation snapshots allow rollback if distillation fails
Revert-to-snapshot restores content without deleting other snapshots
Public chatbot context loader filters out workspace_edit conversations
Interrupted distillation is detected on workspace re-open and surfaced to user
Save as version creates a new status:"draft" version
Publish promotes a saved version to active; public page reflects the change after hard refresh
Discarding working draft removes only the working draft
No regressions on public page rendering
No regressions on public chat
Empty-state initial generation reuses Phase 4 flow correctly
History panel shows both versions and working-draft snapshots distinctly

8. Implementation Sequence
   Execute in order. Each section has a checkpoint. Do not proceed past a checkpoint without confirming.

Type updates. Section 1.1, 1.2, 1.3 — all type changes in web/lib/types.ts. TypeScript compiles.
Migration SQL. Section 1.4. User runs in Supabase SQL editor. Confirm via MCP. Checkpoint 1.
Template components + EditLayer. Section 2. All three templates render distinctly; EditLayer separates edit concerns. Checkpoint 2.
Distillation prompt updates. Section 3. Test distillation produces new layout_template field. Checkpoint 3.
Working draft API routes. Section 4. All routes functional (including revert-to-snapshot and distillation-status). Snapshot cap verified. Checkpoint 4 (chat route tested in step 8).
Workspace UI scaffold. Section 6.1, 6.2, 6.3, 6.7. Two-pane layout, top bar, autosave hook, empty-state handling.
Toolbar controls. Section 6.5 (template, accent, sections, signature drag). Each control wired to the update route. Build before chat — cheap feedback loop proves the working draft model end-to-end.
Workspace chat + proposed edits + routing table. Section 5. Checkpoint 5.
Chat pane UI. Section 6.6.
History panel. Section 6.4.
End-to-end verification. Section 7 checklist. Checkpoint 6.

9. Notes to the Implementing Agent

Use the Supabase MCP to verify working draft state, autosnapshot creation, and version updates at each checkpoint instead of asking the user to paste SQL results.
Do not skip checkpoints. Each is written because the prior session had cascading bugs when verification was deferred.
When in doubt between v1 simplicity and future flexibility, choose v1 simplicity. Wildcard, side-by-side compare, and real-time sync are already deferred. Don't bring them back.
Preserve Phase 4 behavior. The public page, public chat, landing page featured projects, and existing versions must continue to work unchanged.
Do not modify the character pass in distill.py. Only the presentation pass gets the layout_template addition.
Keep templates pure. Templates render versions. EditLayer handles edit affordances. Don't leak edit state into templates.
Keep public chat isolated from workspace conversations. The context field on conversations is the boundary. Enforce it in every context-loading path.
Future master-agent compatibility: working drafts, snapshots, workspace conversations, and edit proposals are all queryable data. Don't abstract them behind opaque interfaces.
If a spec item is ambiguous, leave a TODO(krishna): comment and move on. Don't invent architecture.

10. Roadmap — What Comes After This Build
    This build (the editing workspace) is one step in a longer roadmap. Listed in rough sequence so implementation decisions don't accidentally block future work:
    Near-term (next 1-2 builds)

Use the workspace on real ideas. Tune both currently-published ideas. Publish a third. The workspace's value is proven through use, not through features shipped.
Deployment (this is the original Phase 5 of the KSM Studio roadmap, still not done). Currently the studio and public pages only run on localhost. Production-ready hosting on Vercel, production env vars, production OAuth redirects, production Supabase Auth URL config, optional custom domain. Should happen after the workspace is stable enough that published pages won't need frequent regeneration.

Mid-term

Thinking Profile. Homepage section synthesizing patterns from triage history, growth_observations, outcomes data, and predicted-vs-actual deltas. This is the mentorship layer surfacing. Five sections: current level, strengths, active growth edges, patterns to watch, what to practice.
Design quality pass across studio. Editorial polish on the studio's internal views — loading states, skeleton screens, error states, motion consistency, text contrast.
Signature reality sprint. Replace placeholder gradient signatures with real interactive/visual components per idea. Separate focused build — each signature is genuinely bespoke work.

Longer-term

Wildcard layout template. A fourth, more expressive template. Best added once 5+ ideas are published and patterns in "playful but works" have been observed.
Side-by-side version comparison. Split view showing two versions with scroll sync.
Master agent foundations. An orchestrator that reads across all ideas — their presentation specs, their edit history, their outcomes — and proposes when pages should be refreshed, when family coherence is drifting, when an idea's character has evolved enough that a new version is warranted. The workspace's data model (queryable working drafts, snapshots, proposals) is designed to feed this.
Thinking Profile mature enough to guide triage difficulty. Feedback loop where the Profile's "active growth edges" inform what the next triage session pushes hardest on.
Ideas as living agents. Periodic self-checks (web searches against kill assumptions), insights from public-chat conversations auto-feeding back as journal entries, automated retriage-flagging. The existing triage insight detection is the seed of this.
User-initiated direct edits in workspace chat. Typing instructions directly without going through the proposal step. Requires reliable intent classification. Defer until proposal flow's limitations are felt in practice.
Dual-window mode. Studio in one tab, public page in another, synced via shared session with the master agent orchestrating cross-window edits. A long horizon feature.

Explicitly not on the roadmap

Multi-user collaboration. This is a personal companion. Not a product.
Public-facing edits. Visitors read and converse; they do not edit.
Monetization features of the system itself (the ideas monetize, not the studio).

This roadmap is directional, not a commitment. Reality will reorder it. The goal is continuity — every build leaves the system clean enough that the next build is cheap to start.
