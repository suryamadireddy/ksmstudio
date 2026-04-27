ALTER TABLE ideas ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Portfolio Editing Workspace (Phase 4.5) — Section 1.4
-- Additive portfolio JSONB backfill only (no new columns / tables).
-- layout_template + layout_template_rationale on each version’s presentation.
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ── Checkpoint 1 verification (run manually or via Supabase MCP after the above) ─
-- Expect for your project: exactly 2 rows (two published ideas), each with
-- first_version_template = 'clean', and version_count unchanged vs before migration.
--
-- SELECT
--   id,
--   portfolio->'active_version_id' AS active_id,
--   jsonb_array_length(portfolio->'versions') AS version_count,
--   portfolio->'versions'->0->'presentation'->>'layout_template' AS first_version_template
-- FROM ideas
-- WHERE published = true
-- ORDER BY id;
--
-- Optional: every version on each published idea should report layout_template = clean
-- (no rows returned means OK; any row = a version that is not clean).
--
-- SELECT
--   i.id AS idea_id,
--   ord - 1 AS version_index,
--   elem->'presentation'->>'layout_template' AS layout_template
-- FROM ideas i,
--   LATERAL jsonb_array_elements(i.portfolio->'versions') WITH ORDINALITY AS t(elem, ord)
-- WHERE i.published = true
--   AND i.portfolio->'versions' IS NOT NULL
--   AND coalesce(elem->'presentation'->>'layout_template', '') <> 'clean';
