-- ==============================================================================
-- Migration: 00008_emails_unique_lead_step
-- Project:   Cold Email Campaign Manager
-- Run via:   SUPABASE_ACCESS_TOKEN=... npx supabase db push
--
-- PURPOSE:
--   One email per (lead, sequence_step): one initial + one followup1 +
--   one followup2 per lead.
--   Makes follow-up creation idempotent (on conflict do nothing) against
--   orphan-recovery re-processing of an already-sent initial.
-- ==============================================================================

alter table emails
  add constraint emails_lead_step_unique unique (lead_id, sequence_step);
