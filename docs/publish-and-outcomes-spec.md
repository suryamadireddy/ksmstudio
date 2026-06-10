# Publish/Unpublish Toggle + Outcomes Tab Spec

Two independent features, one Claude Code session. Neither depends on the other.

---

## Part 1: Publish/Unpublish Toggle

### Why now

This is the only Phase 3 item that directly unblocks Phase 4 (public portfolio). It defines the shape of `ideas.portfolio` JSONB, gives you a control to mark ideas as public, and creates the contract that public pages will read from.

### Data model

The `portfolio` column already exists on the `ideas` table (jsonb, currently never written). Define its shape:

```typescript
export interface Portfolio {
  published: boolean;
  published_at: string | null; // ISO8601, set on first publish
  unpublished_at: string | null; // ISO8601, set on unpublish
  slug: string; // URL-safe slug derived from title
  headline: string; // 1-sentence public description
  public_summary: string | null; // Longer summary for portfolio page (generated later by distillation prompt, Phase 4)
  chatbot_context: string | null; // Context for public chatbot (generated later, Phase 4)
}
```

Also add a top-level column for queryable publish state:

```sql
ALTER TABLE ideas
    ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
```

Same pattern as `retriage_pending` — the column is for filtering, the JSONB is for detail.

### Slug generation

Derive from `triage.title`:

- Lowercase
- Replace spaces and special characters with hyphens
- Remove consecutive hyphens
- Trim to 60 characters
- Ensure uniqueness by appending `-2`, `-3` etc. if a slug already exists

Example: "AI Lease Review for Renters" → `ai-lease-review-for-renters`

### API route: POST `/api/ideas/[id]/publish`

File: `web/app/api/ideas/[id]/publish/route.ts`

Accepts: `{ action: "publish" | "unpublish" }`

**On publish:**

1. Fetch the idea — verify it has triage data (can't publish an untriaged idea)
2. Generate slug from `triage.title`
3. Check slug uniqueness across all ideas
4. If `portfolio` is null or has never been published, prompt for a headline (or auto-generate from `triage.triage_reasoning` — first sentence)
5. Write:

```typescript
await supabase
  .from("ideas")
  .update({
    published: true,
    portfolio: {
      published: true,
      published_at: new Date().toISOString(),
      unpublished_at: null,
      slug,
      headline: generatedHeadline,
      public_summary: null, // filled by Phase 4 distillation
      chatbot_context: null, // filled by Phase 4
    },
  })
  .eq("id", id);
```

**On unpublish:**

```typescript
await supabase
  .from("ideas")
  .update({
    published: false,
    portfolio: {
      ...existingPortfolio,
      published: false,
      unpublished_at: new Date().toISOString(),
    },
  })
  .eq("id", id);
```

Unpublishing preserves the slug and headline so re-publishing doesn't lose data. It just flips the boolean.

### UI: Toggle on idea detail page

**Location:** Idea detail page (`/studio/ideas/[id]`), in the sidebar or header area next to the idea title.

**Component:** A toggle switch or button, NOT buried in a menu. Publishing is a deliberate action.

**States:**

1. **Unpublished (default):** Toggle is off. Label: "Publish to portfolio". Clicking opens a confirmation with:
   - Auto-generated headline (editable text field)
   - Preview of the slug URL: `/p/ai-lease-review-for-renters`
   - Note: "This will make the idea visible on your public portfolio"
   - [Publish] [Cancel]

2. **Published:** Toggle is on. Label: "Published" with a green indicator. Small "View public page →" link below. Clicking the toggle shows:
   - "Unpublish this idea? It will no longer appear on your public portfolio."
   - [Unpublish] [Cancel]

**Guard:** If the idea has no triage data, the toggle is disabled with a tooltip: "Triage this idea before publishing."

### Update dashboard

On idea cards (`IdeaCard`), if `published === true`, show a small published indicator — a dot or icon. Nothing loud, just a visual signal that this idea is live.

### Update `get-featured-public-projects.ts`

This file currently returns an empty array. Update it to query real data:

```typescript
export async function getFeaturedPublicProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, raw_input, triage, portfolio")
    .eq("published", true)
    .order("created_at", { ascending: false });

  return (data ?? []).map((idea) => ({
    id: idea.id,
    title: idea.triage?.title ?? idea.raw_input?.slice(0, 60),
    slug: idea.portfolio?.slug,
    headline: idea.portfolio?.headline,
    category: idea.triage?.category,
    disposition: idea.triage?.disposition,
  }));
}
```

### Update public page route

`web/app/(public)/p/[slug]/page.tsx` currently fetches by `id`. It should fetch by slug:

```typescript
const { data: idea } = await supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage, development, portfolio",
  )
  .eq("published", true)
  .eq("portfolio->>slug", slug)
  .single();
```

If the idea is not found or not published, return 404.

### TypeScript type updates

```typescript
export interface Portfolio {
  published: boolean;
  published_at: string | null;
  unpublished_at: string | null;
  slug: string;
  headline: string;
  public_summary: string | null;
  chatbot_context: string | null;
}

// Update Idea interface:
export interface Idea {
  // ... existing fields ...
  published?: boolean; // new column
  portfolio?: Portfolio | null;
}
```

### Select query updates

Add `published` to dashboard query:

```typescript
supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage_version, retriage_pending, published, triage",
  );
```

---

## Part 2: Outcomes Tab

### Why now

The outcomes tab closes the feedback loop. Without it, the system produces builder briefs and next steps but never records what happened. This is critical for:

- The Thinking Profile (compare predictions vs reality)
- The mentorship layer (pattern detection: "you consistently overestimate effort")
- Personal accountability (did you actually follow through?)

### Data model

The `outcomes` column already exists on the `ideas` table (jsonb, currently never written). Define its shape:

```typescript
export interface OutcomeEntry {
  id: string; // uuid
  date: string; // ISO8601
  type:
    | "milestone"
    | "pivot"
    | "kill"
    | "pause"
    | "launch"
    | "learning"
    | "metric";
  title: string; // Short label: "Completed GDELT POC", "Killed — no market signal"
  description: string; // 2-4 sentences of what happened
  predicted_vs_actual?: {
    // Optional — for comparing against triage predictions
    dimension: "effort" | "impact" | "timeline" | "confidence";
    predicted: string; // What triage/artifacts said
    actual: string; // What actually happened
    delta_note: string; // "Effort was 2x what I estimated because..."
  } | null;
}

export interface Outcomes {
  entries: OutcomeEntry[];
  current_status: "active" | "paused" | "killed" | "launched" | "exploring";
  status_updated_at: string;
}
```

### Why entries, not a single field

Outcomes accumulate. A single idea might have:

1. "Completed GDELT POC — data quality is good enough" (milestone)
2. "Pivoted from globe visualization to map-based view" (pivot)
3. "Launched v0.1 to 5 beta users" (launch)
4. "Week 1 retention: 2 of 5 users returned" (metric)

Each is an entry with a timestamp. The `current_status` is a summary field that reflects the latest state.

### API route: POST `/api/ideas/[id]/outcomes`

File: `web/app/api/ideas/[id]/outcomes/route.ts`

**Add entry:**
Accepts: `{ action: "add_entry", entry: Partial<OutcomeEntry> }`

```typescript
// Fetch current outcomes
const { data: idea } = await supabase
  .from("ideas")
  .select("outcomes")
  .eq("id", id)
  .single();

const outcomes = idea?.outcomes ?? {
  entries: [],
  current_status: "exploring",
  status_updated_at: new Date().toISOString(),
};

const newEntry: OutcomeEntry = {
  id: crypto.randomUUID(),
  date: new Date().toISOString(),
  type: entry.type,
  title: entry.title,
  description: entry.description,
  predicted_vs_actual: entry.predicted_vs_actual ?? null,
};

outcomes.entries.push(newEntry);

// Auto-update current_status based on entry type
if (entry.type === "kill") outcomes.current_status = "killed";
if (entry.type === "launch") outcomes.current_status = "launched";
if (entry.type === "pause") outcomes.current_status = "paused";

outcomes.status_updated_at = new Date().toISOString();

await supabase.from("ideas").update({ outcomes }).eq("id", id);
```

**Update status:**
Accepts: `{ action: "update_status", status: Outcomes["current_status"] }`

```typescript
const outcomes = idea?.outcomes ?? {
  entries: [],
  current_status: "exploring",
  status_updated_at: new Date().toISOString(),
};
outcomes.current_status = status;
outcomes.status_updated_at = new Date().toISOString();
await supabase.from("ideas").update({ outcomes }).eq("id", id);
```

**Delete entry:**
Accepts: `{ action: "delete_entry", entry_id: string }`

Removes the entry from the array by id.

### UI: Outcomes tab on idea detail page

Add an "Outcomes" tab to the idea detail page, alongside Overview, Artifacts, Conversations, and Journal.

**Empty state:** "No outcomes recorded yet. Record what happened with this idea — milestones, pivots, kills, learnings." [Add first outcome →]

**List state:** Entries displayed as a vertical timeline, most recent at top.

Each entry shows:

- Type icon/badge (milestone → flag, pivot → arrows, kill → X, pause → pause, launch → rocket, learning → lightbulb, metric → chart)
- Title (bold)
- Date (relative: "3 days ago", or absolute if older)
- Description
- If `predicted_vs_actual` exists: a distinct callout box showing the prediction vs reality comparison

**Add entry form:**

- Type selector (single select from the 7 types)
- Title (short text input)
- Description (textarea)
- Optional toggle: "Compare against prediction?"
  - If yes: shows dimension selector (effort/impact/timeline/confidence), predicted value (auto-populated from triage/artifacts if possible), actual value (text input), delta note (textarea)
- [Save] [Cancel]

**Status bar:**
At the top of the outcomes tab, show the current status as a badge with a dropdown to change it:

- `exploring` → neutral/gray
- `active` → blue
- `paused` → amber
- `killed` → red
- `launched` → green

Changing the status auto-adds a status-change entry to the timeline.

### Auto-populate predictions

When the user toggles "Compare against prediction?" and selects a dimension, auto-fill the "predicted" field:

- `effort` → `"Triage estimated effort at {triage.effort_score}/5"`
- `impact` → `"Triage estimated impact at {triage.impact_score}/5"`
- `timeline` → `"Triage estimated time horizon: {triage.time_horizon}"`
- `confidence` → `"Triage confidence: {triage.confidence}/5"`

The user then fills in "actual" and "delta note." This is the raw data the Thinking Profile will use to detect patterns like "you consistently underestimate effort by 2x."

### Update dashboard idea cards

On idea cards, if `outcomes?.current_status` exists and is not `"exploring"`, show the status as a small badge.

### TypeScript type updates

```typescript
export interface OutcomeEntry {
  id: string;
  date: string;
  type:
    | "milestone"
    | "pivot"
    | "kill"
    | "pause"
    | "launch"
    | "learning"
    | "metric";
  title: string;
  description: string;
  predicted_vs_actual?: {
    dimension: "effort" | "impact" | "timeline" | "confidence";
    predicted: string;
    actual: string;
    delta_note: string;
  } | null;
}

export interface Outcomes {
  entries: OutcomeEntry[];
  current_status: "active" | "paused" | "killed" | "launched" | "exploring";
  status_updated_at: string;
}

// Update Idea interface:
export interface Idea {
  // ... existing fields ...
  outcomes?: Outcomes | null;
}
```

### Converse agent awareness

Update the converse system prompt to include outcomes data when present. Add to `build_system_prompt()` in both Python and TypeScript:

```python
# In Python build_system_prompt():
outcomes = idea.get("outcomes") or {}
if outcomes.get("entries"):
    outcomes_text = "\n".join(
        f"[{e.get('date', '')[:10]}] [{e.get('type')}] {e.get('title')}: {e.get('description')}"
        for e in outcomes["entries"]
    )
    outcomes_block = f"""\
### What has actually happened
Current status: {outcomes.get('current_status', 'unknown')}
{outcomes_text}"""
else:
    outcomes_block = ""
```

Add `outcomes_block` to the knowledge sections assembly. This means the converse agent knows about real-world outcomes and can reference them: "You launched to 5 beta users last month — what did you learn?"

### Select query updates

Add `outcomes` to the idea detail page query:

```typescript
supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage_version, retriage_pending, retriage_reasons, published, triage, development, outcomes",
  )
  .eq("id", id)
  .single();
```

Do NOT add `outcomes` to the dashboard query — it's only needed on the detail page. The dashboard can read `outcomes->current_status` if needed for the status badge, but this can also be derived from a column later if it becomes a performance issue.

---

## Implementation Order

1. SQL: `ALTER TABLE ideas ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;`
2. Part 1: Publish toggle — API route, UI toggle, slug generation, dashboard indicator, public page query update, get-featured-public-projects update
3. Part 2: Outcomes tab — API route, UI tab with timeline and form, converse agent awareness, dashboard status badge
4. TypeScript types for both Portfolio and Outcomes
5. Select query updates for both features

Both features are fully independent — if one takes longer, the other is not blocked.

---

## What This Does NOT Build

| Excluded                              | Why                                                         | When                            |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| Portfolio distillation prompt         | Phase 4 work — generates public_summary and chatbot_context | After public pages are designed |
| Public chatbot on /p/[slug]           | Phase 4 — needs chatbot_context populated                   | After distillation prompt       |
| RLS for public/private split          | Phase 4 — needed when public pages go live                  | Before deployment               |
| Automated outcome tracking            | Would require agent to detect milestones automatically      | After Thinking Profile          |
| Outcome-based triage accuracy scoring | Needs enough outcomes data to be meaningful                 | After 10+ recorded outcomes     |
