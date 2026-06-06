-- ==============================================================================
-- Migration: 00001_init
-- Project:   Cold Email Campaign Manager
-- Run via:   SUPABASE_ACCESS_TOKEN=... npx supabase db push
-- ==============================================================================


-- ==============================================================================
-- TABLES
-- ==============================================================================

-- 1. users — mirrors auth.users (populated automatically by trigger below)
CREATE TABLE public.users (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. campaigns — one user owns many campaigns
CREATE TABLE public.campaigns (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'draft', -- draft | sending | done | paused
  template_subject  TEXT,
  template_body     TEXT,       -- contains {name},{company},{role},{ai_opener}
  ai_prompt         TEXT,       -- personalization instruction for Claude
  daily_limit       INT         NOT NULL DEFAULT 40,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. leads — one campaign has many leads
CREATE TABLE public.leads (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT,
  email        TEXT        NOT NULL,
  company      TEXT,
  role         TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending', -- pending | sent | opened | replied | bounced
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Reply-matching: when Resend fires a webhook, we look up the lead by email
CREATE INDEX idx_leads_email ON public.leads(email);

-- 4. emails — one lead has many emails; also serves as the drip-send job queue
CREATE TABLE public.emails (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id    UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sequence_step  INT         NOT NULL DEFAULT 1, -- 1=initial, 2=followup1, 3=followup2
  subject        TEXT,
  body           TEXT,
  status         TEXT        NOT NULL DEFAULT 'scheduled', -- scheduled | sent | failed | cancelled
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  resend_id      TEXT,       -- Resend's email ID (for webhook matching)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cron job query: SELECT WHERE status='scheduled' AND scheduled_for <= now()
CREATE INDEX idx_emails_status_scheduled_for ON public.emails(status, scheduled_for);

-- 5. events — append-only audit log; never edited or deleted
CREATE TABLE public.events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id     UUID        NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  lead_id      UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL, -- sent | opened | replied | bounced
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload  JSONB       -- full webhook payload for debugging
);


-- ==============================================================================
-- AUTH TRIGGER
-- Automatically creates a public.users row when a user signs up / magic-links.
-- Uses SECURITY DEFINER so it runs as superuser and can bypass RLS to do the
-- INSERT — the new user does not have INSERT permission on public.users yet.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Default behaviour once RLS is enabled: DENY EVERYTHING.
-- Each policy below opens exactly the access required, no more.
-- ==============================================================================
ALTER TABLE public.users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events    ENABLE ROW LEVEL SECURITY;

-- ── users ──────────────────────────────────────────────────────────────────────
-- Only read your own profile row. No INSERT (trigger handles it).
-- No UPDATE/DELETE (not a v1 feature).
CREATE POLICY "users: select own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- ── campaigns ──────────────────────────────────────────────────────────────────
-- Full CRUD on your own campaigns only.
CREATE POLICY "campaigns: select own"
  ON public.campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "campaigns: insert own"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns: update own"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "campaigns: delete own"
  ON public.campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- ── leads ──────────────────────────────────────────────────────────────────────
-- Full CRUD on your own leads only.
CREATE POLICY "leads: select own"
  ON public.leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "leads: insert own"
  ON public.leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads: update own"
  ON public.leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "leads: delete own"
  ON public.leads FOR DELETE
  USING (auth.uid() = user_id);

-- ── emails ─────────────────────────────────────────────────────────────────────
-- Full CRUD on your own email records (authenticated Server Actions).
-- The cron job uses the admin client (service role) which bypasses RLS entirely.
CREATE POLICY "emails: select own"
  ON public.emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "emails: insert own"
  ON public.emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "emails: update own"
  ON public.emails FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "emails: delete own"
  ON public.emails FOR DELETE
  USING (auth.uid() = user_id);

-- ── events ─────────────────────────────────────────────────────────────────────
-- SELECT only — authenticated users can read their own events for the dashboard.
-- NO INSERT/UPDATE/DELETE policies — events are written exclusively by the cron
-- job and Resend webhook handler, both of which use the admin client (service
-- role key) that bypasses RLS. This prevents users from forging open/reply events.
CREATE POLICY "events: select own"
  ON public.events FOR SELECT
  USING (auth.uid() = user_id);
