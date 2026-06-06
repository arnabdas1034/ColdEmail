-- ==============================================================================
-- Migration: 00002_grants
-- Project:   Cold Email Campaign Manager
-- Purpose:   Grant table-level privileges to Supabase Postgres roles.
--
-- WHY THIS IS NEEDED:
--   When tables are created via raw SQL migrations (not via the Supabase UI),
--   Postgres does not automatically grant access to the PostgREST roles.
--   Without these grants, even the service_role key gets "permission denied"
--   at the Postgres level (before RLS is even evaluated).
--
-- ROLE SUMMARY:
--   anon          → unauthenticated requests (public pages, login form)
--   authenticated → logged-in users (RLS policies further restrict rows)
--   service_role  → admin client / cron / webhooks (bypasses RLS, needs grants)
-- ==============================================================================

-- Allow all roles to see the public schema exists
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: full access to all tables and sequences.
-- RLS bypass is a separate privilege — it still needs table-level grants.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated: CRUD access. RLS policies (from 00001_init.sql) restrict
-- which ROWS each user can actually touch. The GRANT opens the door;
-- RLS decides who gets through.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT USAGE                          ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- anon: read-only. The login page uses the anon key to call
-- supabase.auth.signInWithOtp() — that hits auth.*, not public.* tables,
-- so anon doesn't actually need public table access in v1.
-- Granting SELECT anyway for future-proofing (RLS still applies).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Ensure future tables created in this schema also get these grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE                          ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
