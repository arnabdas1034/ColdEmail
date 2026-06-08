-- ==============================================================================
-- Migration: 00006_events_email_id_nullable
-- Makes events.email_id nullable for inbound reply events (T6.7c).
--
-- WHY THIS IS NEEDED:
--   An inbound reply (email.received) originates from a message the prospect
--   sent us — there is no outbound emails row, and therefore no emails.id to
--   reference. type='replied' events are tied to lead_id + user_id only.
--   With the original NOT NULL constraint, inserting such an event would raise
--   a not-null violation, the inbound webhook would 500, and Svix would retry
--   the delivery forever.
--
-- FK UNCHANGED:
--   The foreign key to emails(id) stays in place. A Postgres FK permits NULL —
--   it only validates non-null values — so outbound events (sent/opened/
--   delivered/bounced/complained) still reference a real email, while inbound
--   reply events reference none. ON DELETE CASCADE is unaffected by NULLs.
-- ==============================================================================

ALTER TABLE public.events
  ALTER COLUMN email_id DROP NOT NULL;
