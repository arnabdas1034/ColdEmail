-- ==============================================================================
-- Migration: 00007_suppressions
-- Project:   Cold Email Campaign Manager
-- Run via:   SUPABASE_ACCESS_TOKEN=... npx supabase db push
--
-- PURPOSE:
--   Standalone do-not-send list keyed by (user_id, email). Intentionally NOT a
--   flag on leads — a suppressed address (unsubscribe/bounce/complaint) often
--   has no lead row in the current campaign, so the send guard must look it up
--   by address independent of any lead.
--
--   email is stored normalized as lower(btrim(email)); the CHECK enforces it so
--   any un-normalized write THROWS instead of silently creating a suppression
--   the normalized send-guard lookup (WHERE user_id=? AND email=?) can never
--   match.
--
--   unique (user_id, email) is BOTH the idempotency key for at-least-once
--   webhook writes AND the index for the send-guard lookup. Do NOT add a
--   separate index.
-- ==============================================================================


-- ==============================================================================
-- TABLE
-- ==============================================================================
create table if not exists suppressions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  email       text not null check (email = lower(btrim(email)) and email <> ''),
  reason      text not null check (reason in ('unsubscribe','bounce','complaint','manual')),
  source      text,
  -- a suppression must outlive its lead: deleting/erasing a lead must not drop
  -- or block the do-not-send record, so the FK nulls out instead of cascading.
  lead_id     uuid references leads(id) on delete set null,
  raw_payload jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, email)
);

alter table suppressions enable row level security;


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Mirrors the leads policy pattern from 00001_init.sql exactly:
--   same auth.uid() = user_id predicate, same naming convention.
-- SELECT own + INSERT own only — NO update/delete policy (suppressions are not
-- edited or removed by users; webhooks/admin client write via service_role).
-- ==============================================================================
create policy "suppressions: select own"
  on public.suppressions for select
  using (auth.uid() = user_id);

create policy "suppressions: insert own"
  on public.suppressions for insert
  with check (auth.uid() = user_id);


-- ==============================================================================
-- GRANTS
-- suppressions are never user-edited; authenticated gets select+insert only.
-- The revoke also overrides any ALTER DEFAULT PRIVILEGES from 00002 that would
-- grant update/delete. RLS (no update/delete policy) is the second layer.
-- ==============================================================================
grant all             on public.suppressions to service_role;
grant select, insert  on public.suppressions to authenticated;
grant select          on public.suppressions to anon;
revoke update, delete on public.suppressions from authenticated;
