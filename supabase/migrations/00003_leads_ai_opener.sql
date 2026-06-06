-- ==============================================================================
-- Migration: 00003_leads_ai_opener
-- Adds a nullable column to store Claude's per-lead personalised opener.
--
-- NULL = opener not yet generated.
-- No default, no index — this column is read as part of full lead rows,
-- never filtered by value.
--
-- Fully backward-compatible: existing rows get NULL, existing queries are
-- unaffected. The application layer treats NULL as "pending generation".
-- ==============================================================================

ALTER TABLE public.leads
  ADD COLUMN ai_opener TEXT;
