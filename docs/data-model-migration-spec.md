# KSM Studio — Data Model Migration Spec

Four targeted structural fixes to the data model. Execute in order. Each step is backward-compatible with the next — no step requires the others to be complete before it can be verified.

**Important:** After each step, verify the application still works. Run `python triage.py` (cancel after first question), load the studio dashboard in the browser, and open an idea detail page. If anything breaks, fix it before moving to the next step.

---

## Step 1: Move `raw_transcript` Out of Triage JSONB

### The problem

Every triage session stores the full conversation transcript (8-10 turns, 5-10KB) inside `ideas.triage.raw_transcript`. Every re-triage adds another transcript inside `triage_history[n].raw_transcript`. Every query that does `select("*")` on the ideas table — dashboard, detail page, artifacts pipeline — pulls all of this data even though it is never displayed or used outside of raw audit review.

### The fix

Triage conversations belong in the `conversations` + `messages` tables, just like converse sessions.

### 1a. Update `triage.py` — new triage

In `save_idea()`, after inserting the idea row:

1. Create a conversation row with `context: "triage"`:

```python
conv_id = str(uuid.uuid4())
db.table("conversations").insert({
    "id": conv_id,
    "idea_id": idea_id,
    "context": "triage",
    "created_at": datetime.now(timezone.utc).isoformat(),
}).execute()
```

2. Write each turn from the transcript to the `messages` table:

```python
for entry in transcript:
    db.table("messages").insert({
        "id": str(uuid.uuid4()),
        "conversation_id": conv_id,
        "idea_id": idea_id,
        "role": entry["role"],
        "content": entry["content"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
```

3. Remove `raw_transcript` from the triage JSONB before writing:

```python
row = {
    "id": idea_id,
    "raw_input": raw_input,
    "domain": domain,
    "triage": {
        **validated,
        # NO raw_transcript here
        "triaged_at": datetime.now(timezone.utc).isoformat(),
    },
}
```

### 1b. Update `triage.py` — re-triage (`save_retriage`)

Same pattern: write the re-triage conversation to `conversations` (with `context: "retriage"`) and `messages`. When creating the triage history snapshot, strip `raw_transcript` from the snapshot:

```python
# Create the historical snapshot — strip raw_transcript
snapshot = {
    k: v for k, v in current_triage.items()
    if k not in ("triage_history", "raw_transcript")
}
```

### 1c. Update web API routes

**`web/app/api/triage/route.ts`** — after inserting the idea row, write the triage conversation to `conversations` + `messages`. Do not include `raw_transcript` in the triage JSONB.

**`web/app/api/triage/retrigger/route.ts`** — same: write conversation to tables, strip transcript from snapshot and new triage.

### 1d. Migrate existing data

Run this one-time SQL in Supabase SQL Editor:

```sql
-- Step 1: Create conversation rows for existing triages
-- (Run this manually for each existing idea, or write a script)
-- For each idea that has triage.raw_transcript:

-- Create conversation for the current triage
INSERT INTO conversations (id, idea_id, context, created_at)
SELECT
    gen_random_uuid(),
    id,
    'triage',
    (triage->>'triaged_at')::timestamptz
FROM ideas
WHERE triage IS NOT NULL
  AND triage ? 'raw_transcript';

-- Note: migrating individual messages from the transcript JSON array
-- into the messages table requires a script (see below).

-- Step 2: Strip raw_transcript from triage JSONB
UPDATE ideas
SET triage = triage - 'raw_transcript'
WHERE triage IS NOT NULL
  AND triage ? 'raw_transcript';

-- Step 3: Strip raw_transcript from triage_history snapshots
-- This requires iterating the array — use a script or:
UPDATE ideas
SET triage = jsonb_set(
    triage,
    '{triage_history}',
    (
        SELECT COALESCE(jsonb_agg(elem - 'raw_transcript'), '[]'::jsonb)
        FROM jsonb_array_elements(triage->'triage_history') AS elem
    )
)
WHERE triage IS NOT NULL
  AND triage ? 'triage_history'
  AND jsonb_array_length(triage->'triage_history') > 0;
```

**For the message migration** (optional — existing transcripts are small, so you can skip this and just archive the data loss). If you want to preserve them:

```python
# One-time migration script: migrate_transcripts.py
from db import get_client
import uuid
from datetime import datetime, timezone

db = get_client()
ideas = db.table("ideas").select("id, triage").not_.is_("triage", "null").execute()

for idea in ideas.data:
    triage = idea.get("triage") or {}
    transcript = triage.get("raw_transcript", [])
    if not transcript:
        continue

    # Create conversation
    conv_id = str(uuid.uuid4())
    triaged_at = triage.get("triaged_at", datetime.now(timezone.utc).isoformat())
    db.table("conversations").insert({
        "id": conv_id,
        "idea_id": idea["id"],
        "context": "triage",
        "created_at": triaged_at,
    }).execute()

    # Write messages
    for entry in transcript:
        db.table("messages").insert({
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "idea_id": idea["id"],
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
            "created_at": triaged_at,
        }).execute()

    print(f"Migrated transcript for idea {idea['id']} ({len(transcript)} turns)")
```

### 1e. Update TypeScript types

In `web/lib/types.ts`, remove `raw_transcript` from both `Triage` and `TriageSnapshot`:

```typescript
// REMOVE these lines:
// raw_transcript?: unknown[];
```

### 1f. Verify

- `raw_transcript` no longer appears in any triage JSONB
- Triage conversations appear in the conversations table with `context: "triage"`
- Triage turns appear in the messages table
- Dashboard loads without pulling transcript data
- No code references `triage.raw_transcript` or `t.raw_transcript` anywhere

---

## Step 2: Promote Queryable State to Columns

### The problem

`triage_version` and `retriage_pending` are inside the triage JSONB. "Show me ideas pending re-triage" or "sort by most-revised" requires JSONB path queries instead of simple column filters.

### The fix

Add columns to the `ideas` table. Keep the JSONB data as the detail layer — columns are for filtering and sorting.

### 2a. Add columns in Supabase SQL Editor

```sql
-- Add new columns
ALTER TABLE ideas
    ADD COLUMN IF NOT EXISTS triage_version integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS retriage_pending boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS retriage_reasons jsonb DEFAULT '[]'::jsonb;

-- Backfill triage_version from existing JSONB
UPDATE ideas
SET triage_version = COALESCE((triage->>'triage_version')::integer, 1)
WHERE triage IS NOT NULL;

-- No existing ideas have retriage_pending, so default false is correct.
```

### 2b. Update `triage.py`

**`save_idea()`** — set `triage_version: 1` as a column:

```python
row = {
    "id": str(uuid.uuid4()),
    "raw_input": raw_input,
    "domain": domain,
    "triage_version": 1,
    "triage": {
        **validated,
        "triaged_at": datetime.now(timezone.utc).isoformat(),
    },
}
```

**`save_retriage()`** — increment column and clear pending flag:

```python
db.table("ideas").update({
    "triage": new_triage,
    "triage_version": current_version + 1,
    "retriage_pending": False,
    "retriage_reasons": [],
}).eq("id", idea_id).execute()
```

Keep `triage_version` inside the JSONB as well for now (the history snapshots reference it). The column is the queryable copy; the JSONB is the audit copy.

### 2c. Update web API routes

**`web/app/api/triage/route.ts`** — include `triage_version: 1` in the INSERT.

**`web/app/api/triage/retrigger/route.ts`** — include `triage_version`, `retriage_pending: false`, `retriage_reasons: []` in the UPDATE.

### 2d. Update the triage-insight-spec

When the insight spec writes `retriage_pending`, it should set the column:

```python
# Instead of writing to triage JSONB:
db.table("ideas").update({
    "retriage_pending": True,
    "retriage_reasons": db.table("ideas")
        .select("retriage_reasons")
        .eq("id", idea_id)
        .single()
        .execute()
        .data.get("retriage_reasons", [])
        + [{"reason": reason, "flagged_at": now, "source": "conversation"}],
}).eq("id", idea_id).execute()
```

(Simplify this in implementation — fetch current reasons, append, write back.)

### 2e. Update TypeScript types

Add to the `Idea` interface:

```typescript
export interface Idea {
  // ... existing fields ...
  triage_version?: number;
  retriage_pending?: boolean;
  retriage_reasons?: Array<{
    reason: string;
    flagged_at: string;
    source: "conversation" | "agent" | "user";
  }>;
}
```

### 2f. Update dashboard queries

The studio page and idea cards can now filter and sort using columns:

```typescript
// Show ideas pending re-triage first
supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage_version, retriage_pending, triage",
  )
  .order("retriage_pending", { ascending: false })
  .order("created_at", { ascending: false });
```

### 2g. Update UI

- IdeaCard: if `retriage_pending === true`, show the pending indicator (from insight spec)
- Idea detail: read `retriage_reasons` from the column, not from triage JSONB
- Remove `retriage_pending` and `retriage_reasons` references from inside the triage JSONB everywhere in the codebase. These fields should ONLY exist as columns.

---

## Step 3: Restructure Kill Assumptions to Objects

### The problem

Kill assumptions are stored as `string[]`. The insight spec needs to track status per assumption, which means creating a parallel `kill_assumption_statuses` dict keyed by fuzzy string matching. This is fragile — if assumption wording changes between sessions, the match breaks.

### The fix

Make each kill assumption a structured object with its own status.

### 3a. Update the `complete_interview` tool schema

In `triage.py`, change the `kill_assumptions` property in `COMPLETE_TOOL`:

```python
"kill_assumptions": {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "The assumption stated as a falsifiable claim.",
            },
            "status": {
                "type": "string",
                "enum": ["untested", "validated", "invalidated", "weakened", "strengthened"],
                "description": "Current status. Always 'untested' for new triages.",
            },
        },
        "required": ["text", "status"],
    },
    "description": (
        "2–4 assumptions that, if false, make this idea not worth pursuing. "
        "Each should be falsifiable. Most direction-changing first. "
        "Set status to 'untested' for all assumptions in a new triage."
    ),
},
```

Update the system prompt scoring section to mention that assumptions should all be `"untested"` on initial triage. On re-triage, the agent should review existing assumption statuses and can update them.

### 3b. Update `_validate_fields()` in triage.py

Add a validation step that ensures kill_assumptions are objects:

```python
# Normalize kill_assumptions to object format
raw_ka = data.get("kill_assumptions", [])
normalized = []
for item in raw_ka:
    if isinstance(item, str):
        # Old format — convert
        normalized.append({"text": item, "status": "untested"})
    elif isinstance(item, dict) and "text" in item:
        # New format — ensure status exists
        if "status" not in item:
            item["status"] = "untested"
        normalized.append(item)
data["kill_assumptions"] = normalized
```

This handles both old-format strings (from existing data) and new-format objects (from the updated tool schema) gracefully.

### 3c. Update all downstream consumers

Every place that reads `kill_assumptions` needs to handle the new shape. Here's every reference:

**sharpen.py** — `build_user_message()` passes the full triage JSON. The sharpening system prompt references `triage.kill_assumptions` for search queries. Update the system prompt instruction:

```
Search 3 — Kill assumption validation:
For each kill assumption in the triage object (each is an object with
"text" and "status" fields), run a targeted search using the "text"
value to find evidence that confirms or challenges it.
```

**artifacts.py** — multiple `build_*_context()` functions format assumptions as bullet points:

```python
# BEFORE (in all build_*_context functions):
"\n".join(f"- {a}" for a in triage.get("kill_assumptions", []))

# AFTER:
"\n".join(
    f"- {a['text']} [{a.get('status', 'untested')}]"
    if isinstance(a, dict) else f"- {a}"
    for a in triage.get("kill_assumptions", [])
)
```

The `isinstance` check provides backward compatibility with any data that hasn't been migrated yet.

**converse.py** — `build_system_prompt()` formats assumptions:

```python
# BEFORE:
kill_assumptions = "\n".join(
    f"- {a}" for a in triage.get("kill_assumptions", [])
)

# AFTER:
kill_assumptions = "\n".join(
    f"- {a['text']} [{a.get('status', 'untested')}]"
    if isinstance(a, dict) else f"- {a}"
    for a in triage.get("kill_assumptions", [])
)
```

**web/app/api/converse/route.ts** — `buildSystemPrompt()`:

```typescript
// BEFORE:
${(t.kill_assumptions ?? []).map((a) => `- ${a}`).join("\n")}

// AFTER:
${(t.kill_assumptions ?? []).map((a) =>
    typeof a === "object" ? `- ${a.text} [${a.status ?? "untested"}]` : `- ${a}`
).join("\n")}
```

**web/app/api/triage/retrigger/route.ts** — same pattern in any context builders.

**UI components** — anywhere kill assumptions are rendered (IdeaDetailShell, IdeaSidebar, Overview tab):

```typescript
// BEFORE:
{triage.kill_assumptions?.map((a, i) => <li key={i}>{a}</li>)}

// AFTER:
{triage.kill_assumptions?.map((a, i) => {
    const text = typeof a === "object" ? a.text : a;
    const status = typeof a === "object" ? a.status : "untested";
    return <li key={i}>{text} <StatusBadge status={status} /></li>;
})}
```

Create a small `StatusBadge` component that renders:

- `untested` → no badge (default state)
- `validated` → green checkmark
- `invalidated` → red X
- `weakened` → yellow warning
- `strengthened` → green arrow up

### 3d. Update TypeScript types

```typescript
// NEW type
export interface KillAssumption {
  text: string;
  status: "untested" | "validated" | "invalidated" | "weakened" | "strengthened";
  status_updated_at?: string;
  status_source?: "conversation" | "agent" | "user" | "triage";
}

// UPDATE in Triage and TriageSnapshot:
// BEFORE:
// kill_assumptions: string[];
// AFTER:
kill_assumptions: (KillAssumption | string)[];  // union supports migration period
```

The union type `(KillAssumption | string)[]` allows both old and new format during the migration period. After all data is migrated, tighten to `KillAssumption[]`.

### 3e. Migrate existing data

```sql
-- Convert string[] kill_assumptions to object[] for all ideas
UPDATE ideas
SET triage = jsonb_set(
    triage,
    '{kill_assumptions}',
    (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'text', elem::text,
                    'status', 'untested'
                )
            ),
            '[]'::jsonb
        )
        FROM jsonb_array_elements_text(triage->'kill_assumptions') AS elem
    )
)
WHERE triage IS NOT NULL
  AND jsonb_typeof(triage->'kill_assumptions') = 'array'
  AND jsonb_array_length(triage->'kill_assumptions') > 0
  AND jsonb_typeof(triage->'kill_assumptions'->0) = 'string';

-- Same for triage_history snapshots
UPDATE ideas
SET triage = jsonb_set(
    triage,
    '{triage_history}',
    (
        SELECT COALESCE(
            jsonb_agg(
                CASE
                    WHEN jsonb_typeof(snapshot->'kill_assumptions'->0) = 'string'
                    THEN jsonb_set(
                        snapshot,
                        '{kill_assumptions}',
                        (
                            SELECT COALESCE(
                                jsonb_agg(
                                    jsonb_build_object('text', ka::text, 'status', 'untested')
                                ),
                                '[]'::jsonb
                            )
                            FROM jsonb_array_elements_text(snapshot->'kill_assumptions') AS ka
                        )
                    )
                    ELSE snapshot
                END
            ),
            '[]'::jsonb
        )
        FROM jsonb_array_elements(triage->'triage_history') AS snapshot
    )
)
WHERE triage IS NOT NULL
  AND triage ? 'triage_history'
  AND jsonb_array_length(triage->'triage_history') > 0;
```

### 3f. Update the triage-insight-spec

The insight spec's `_update_kill_assumption_status()` function simplifies dramatically:

```python
def _update_kill_assumption_status(
    supabase: Client,
    idea_id: str,
    assumption_text: str,
    status: str,
) -> None:
    """Update the status of a specific kill assumption."""
    result = (
        supabase.table("ideas")
        .select("triage")
        .eq("id", idea_id)
        .single()
        .execute()
    )
    triage = result.data.get("triage") or {}
    assumptions = triage.get("kill_assumptions", [])

    # Find matching assumption by text
    updated = False
    for a in assumptions:
        if isinstance(a, dict) and (
            assumption_text.lower() in a["text"].lower()
            or a["text"].lower() in assumption_text.lower()
        ):
            a["status"] = status
            a["status_updated_at"] = datetime.now(timezone.utc).isoformat()
            a["status_source"] = "conversation"
            updated = True
            break

    if updated:
        triage["kill_assumptions"] = assumptions
        supabase.table("ideas").update({"triage": triage}).eq("id", idea_id).execute()
```

No more parallel `kill_assumption_statuses` dict. The status lives on the assumption itself.

---

## Step 4: Replace `select("*")` With Specific Columns

### The problem

Every query pulls the full ideas row including the entire development JSONB (PRD, MVP scope, next steps, builder brief — potentially 50KB+ of structured data) even when the consumer only needs a title and disposition.

### The fix

Define named query shapes for each consumer. Implement as constants or helper functions.

### 4a. Query shapes

**Dashboard / idea listing:**

```
id, raw_input, domain, state, created_at, triage_version, retriage_pending,
triage->title, triage->category, triage->disposition, triage->effort_score,
triage->impact_score, triage->confidence, triage->provisional
```

In Supabase client syntax:

```typescript
supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage_version, retriage_pending, triage",
  )
  .order("created_at", { ascending: false });
```

Note: Supabase JS client doesn't support JSONB path selection in `.select()`. The practical approach is to select the `triage` column (without `development`) and strip what you don't need client-side. The big win is NOT selecting `development`, which contains the bulk of the data.

**Idea detail page:**

```typescript
// This page needs everything — triage + development + journal + conversations
// Keep select("*") here BUT split into parallel queries:
supabase
  .from("ideas")
  .select(
    "id, raw_input, domain, state, created_at, triage_version, retriage_pending, retriage_reasons, triage, development",
  )
  .eq("id", id)
  .single();
```

Still gets development, but that's appropriate here — the detail page renders artifacts.

**Pipeline stages (sharpen):**

```typescript
supabase.from("ideas").select("raw_input, triage").eq("id", idea_id).single();
```

Already correct — sharpen.py does this. No change needed.

**Pipeline stages (artifacts):**

```typescript
// Needs triage + development for context building
supabase
  .from("ideas")
  .select("raw_input, triage, development")
  .eq("id", idea_id)
  .single();
```

Currently does `select("*")` — change to the above.

**Converse context loading:**

```typescript
supabase
  .from("ideas")
  .select("id, raw_input, domain, state, created_at, triage, development")
  .eq("id", idea_id)
  .single();
```

Drops `portfolio`, `outcomes`, `revision_history` which are unused.

**Prior triage context (for triage/retriage):**

```typescript
supabase
  .from("ideas")
  .select("id, triage")
  .not("triage", "is", null)
  .order("created_at", { ascending: false })
  .limit(10);
```

Already correct in most places. Verify all call sites.

### 4b. Files to update

| File                                          | Current                | Target                                                                                                                        |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `web/app/(studio)/studio/page.tsx`            | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage_version, retriage_pending, triage")`                                |
| `web/app/(studio)/studio/ideas/[id]/page.tsx` | `select("*")` on ideas | `select("id, raw_input, domain, state, created_at, triage_version, retriage_pending, retriage_reasons, triage, development")` |
| `web/app/api/artifacts/route.ts`              | `select("*")`          | `select("raw_input, triage, development")`                                                                                    |
| `web/app/api/converse/route.ts`               | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage, development")`                                                     |
| `web/app/(public)/p/[slug]/page.tsx`          | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage, development, portfolio")`                                          |
| `web/app/ideas/[id]/page.tsx`                 | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage, development")`                                                     |
| `web/app/ideas/page.tsx`                      | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage")`                                                                  |
| `web/lib/get-featured-public-projects.ts`     | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage")`                                                                  |
| `artifacts.py` fetch_idea                     | `select("*")`          | `select("raw_input, triage, development")`                                                                                    |
| `converse.py` fetch_idea                      | `select("*")`          | `select("id, raw_input, domain, state, created_at, triage, development")`                                                     |
| `triage.py` run_retriage                      | `select("*")`          | `select("id, raw_input, triage, development")`                                                                                |

### 4c. Verify

After all changes, grep the codebase for `select("*")` and `select('*')`. The ONLY remaining instance should be in the idea detail page if you chose to keep it there, or zero if you specified columns everywhere.

---

## Implementation Order for Claude Code

```
1. Run the SQL migration for Step 2 first (add columns) — this is non-destructive
2. Implement Step 1 (transcript migration) — code changes + data migration script
3. Run the SQL migration for Step 3 (kill assumptions) — data transformation
4. Implement Step 3 code changes — tool schema, consumers, UI, types
5. Implement Step 2 code changes — triage.py, retrige, web routes, UI
6. Implement Step 4 (select columns) — mechanical find-and-replace across codebase
7. Run verification: no select("*"), no raw_transcript in JSONB, kill_assumptions are objects, columns queryable
```

### Post-migration: Update the triage-insight-spec

After this migration, the triage-insight-spec needs three adjustments before implementation:

1. Remove `kill_assumption_statuses` dict — status lives on the assumption objects directly
2. Write `retriage_pending` and `retriage_reasons` as columns, not JSONB fields
3. The `_update_kill_assumption_status()` function uses the simplified version from Step 3f

These adjustments are documented above. The insight spec file itself does NOT need to be rewritten — Claude Code should apply the adjustments inline during implementation.

---

## Summary of Breaking Changes

| Change                                                   | What breaks                                                | Fix                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `raw_transcript` removed from triage JSONB               | Any code reading `triage.raw_transcript`                   | Remove references; transcripts now in conversations/messages  |
| `kill_assumptions` changes from `string[]` to `object[]` | Every consumer that iterates assumptions                   | Add `typeof` / `isinstance` checks; read `.text` from objects |
| New columns on `ideas` table                             | Nothing — columns are additive with defaults               | N/A                                                           |
| `select("*")` replaced                                   | Nothing — more specific selects return subset of same data | Verify components don't reference fields no longer selected   |
