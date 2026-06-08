-- ==============================================================================
-- Migration: 00005_emails_resend_id_index
-- Adds an index on emails.resend_id for the Resend webhook matcher (T6.7).
--
-- WHY THIS IS NEEDED:
--   Every outbound delivery event from Resend (delivered / opened / bounced /
--   complained) identifies the message by Resend's own email id. The webhook
--   handler matches it back to our row with:
--       SELECT ... FROM emails WHERE resend_id = <payload.data.email_id>
--   Without an index this is a full table scan on every webhook delivery.
--   Svix delivers at-least-once, so the same lookup fires repeatedly per email.
--
-- PARTIAL (WHERE resend_id IS NOT NULL):
--   resend_id is NULL until an email is actually sent. Only sent rows are ever
--   looked up by the webhook, so a partial index stays small (≈ sent emails,
--   not the full scheduled backlog) and skips the NULL-heavy tail entirely.
--
-- NOT unique by design:
--   The Resend idempotency key (email row UUID) already guarantees one resend_id
--   per row in practice, but we do not want a UNIQUE constraint to be the thing
--   that hard-fails a send-status UPDATE if that invariant is ever violated.
--   Idempotency in the webhook layer is handled by DISTINCT counting and
--   status-transition guards, not by a uniqueness constraint here.
-- ==============================================================================

CREATE INDEX idx_emails_resend_id
  ON public.emails(resend_id)
  WHERE resend_id IS NOT NULL;
