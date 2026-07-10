-- =============================================================================
-- KSM Studio — Supabase Row Level Security Policies
-- =============================================================================
--
-- 1. This file documents the RLS policies currently applied to Supabase.
--
-- 2. These policies have been verified working as of 2026-04-17.
--
-- 3. If you modify policies in the Supabase dashboard, update this file
--    to match so the documented state stays in sync with reality.
--
-- 4. To rebuild the database from scratch, run this file in the Supabase
--    SQL Editor AFTER running schema migrations (run-in-supabase.sql and
--    any other migration files).
--
-- =============================================================================

-- Studio owner allowlist. Seed this table after the owner has signed in once:
--
--   INSERT INTO private.studio_owners (user_id)
--   SELECT id FROM auth.users WHERE email = 'owner@example.com';
--
-- If this table is empty, authenticated studio access fails closed.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.studio_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_studio_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.studio_owners
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION private.is_studio_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_studio_owner() TO authenticated;

-- Enable RLS on all tables

ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE refinements ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- IDEAS TABLE

DROP POLICY IF EXISTS "Authenticated full access to ideas" ON ideas;
DROP POLICY IF EXISTS "Studio owner full access to ideas" ON ideas;

CREATE POLICY "Studio owner full access to ideas"
  ON ideas FOR ALL
  TO authenticated
  USING (private.is_studio_owner())
  WITH CHECK (private.is_studio_owner());

DROP POLICY IF EXISTS "Public read published ideas" ON ideas;

CREATE POLICY "Public read published ideas"
  ON ideas FOR SELECT
  TO anon
  USING (published = true);

-- JOURNAL ENTRIES

DROP POLICY IF EXISTS "Authenticated full access to journal" ON journal_entries;
DROP POLICY IF EXISTS "Studio owner full access to journal" ON journal_entries;

CREATE POLICY "Studio owner full access to journal"
  ON journal_entries FOR ALL
  TO authenticated
  USING (private.is_studio_owner())
  WITH CHECK (private.is_studio_owner());

-- REFINEMENTS

DROP POLICY IF EXISTS "Authenticated full access to refinements" ON refinements;
DROP POLICY IF EXISTS "Studio owner full access to refinements" ON refinements;

CREATE POLICY "Studio owner full access to refinements"
  ON refinements FOR ALL
  TO authenticated
  USING (private.is_studio_owner())
  WITH CHECK (private.is_studio_owner());

-- CONVERSATIONS

DROP POLICY IF EXISTS "Authenticated full access to conversations" ON conversations;
DROP POLICY IF EXISTS "Studio owner full access to conversations" ON conversations;

CREATE POLICY "Studio owner full access to conversations"
  ON conversations FOR ALL
  TO authenticated
  USING (private.is_studio_owner())
  WITH CHECK (private.is_studio_owner());

DROP POLICY IF EXISTS "Public can create portfolio conversations" ON conversations;

CREATE POLICY "Public can create portfolio conversations"
  ON conversations FOR INSERT
  TO anon
  WITH CHECK (context = 'portfolio_public');

DROP POLICY IF EXISTS "Public can read own portfolio conversations" ON conversations;

CREATE POLICY "Public can read own portfolio conversations"
  ON conversations FOR SELECT
  TO anon
  USING (context = 'portfolio_public');

-- MESSAGES

DROP POLICY IF EXISTS "Authenticated full access to messages" ON messages;
DROP POLICY IF EXISTS "Studio owner full access to messages" ON messages;

CREATE POLICY "Studio owner full access to messages"
  ON messages FOR ALL
  TO authenticated
  USING (private.is_studio_owner())
  WITH CHECK (private.is_studio_owner());

DROP POLICY IF EXISTS "Public can create messages in portfolio conversations" ON messages;

CREATE POLICY "Public can create messages in portfolio conversations"
  ON messages FOR INSERT
  TO anon
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE context = 'portfolio_public'
    )
  );

DROP POLICY IF EXISTS "Public can read messages in portfolio conversations" ON messages;

CREATE POLICY "Public can read messages in portfolio conversations"
  ON messages FOR SELECT
  TO anon
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE context = 'portfolio_public'
    )
  );
