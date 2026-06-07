-- ==============================================================================
-- Migration: 00004_emails_claimed_at
-- Adds a timestamp to record when the cron sender atomically claimed a row.
--
-- Purpose: the orphan reaper must key on the CLAIM time, not scheduled_for.
-- scheduled_for is the delivery time — a backlog row that is legitimately
-- in-flight could have a scheduled_for far in the past, causing the reaper to
-- mis-reclaim it if it keys on scheduled_for during a slow run.
-- claimed_at is set by the claim UPDATE and is only non-null once the row is
-- actually in-flight; the reaper checks claimed_at < now() - 10 min.
--
-- Nullable (no default): existing rows and newly scheduled rows have NULL
-- until they are claimed. The reaper also resets NULL claimed_at rows that
-- are stuck in 'sending' (should not happen post-migration, but safe to handle).
-- ==============================================================================

ALTER TABLE public.emails
  ADD COLUMN claimed_at TIMESTAMPTZ;
