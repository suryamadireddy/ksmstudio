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

-- Enable RLS on all tables

ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE refinements ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Public portfolio chat history is mediated by server-side routes using the
-- service role key. Anonymous clients must not directly read or write
-- conversations/messages, or one visitor could access another visitor's chat.
DROP POLICY IF EXISTS "Public can create portfolio conversations" ON conversations;
DROP POLICY IF EXISTS "Public can read own portfolio conversations" ON conversations;
DROP POLICY IF EXISTS "Public can create messages in portfolio conversations" ON messages;
DROP POLICY IF EXISTS "Public can read messages in portfolio conversations" ON messages;

-- IDEAS TABLE

CREATE POLICY "Authenticated full access to ideas"
  ON ideas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read published ideas"
  ON ideas FOR SELECT
  TO anon
  USING (published = true);

-- JOURNAL ENTRIES

CREATE POLICY "Authenticated full access to journal"
  ON journal_entries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- REFINEMENTS

CREATE POLICY "Authenticated full access to refinements"
  ON refinements FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- CONVERSATIONS

CREATE POLICY "Authenticated full access to conversations"
  ON conversations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- MESSAGES

CREATE POLICY "Authenticated full access to messages"
  ON messages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
