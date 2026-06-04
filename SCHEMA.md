# SCHEMA.md — Cold Email Manager (v1)
# Database: Supabase (Postgres)

## Tables

### users
- id            uuid PK   (Supabase Auth provides)
- email         text
- created_at    timestamptz

### campaigns
- id            uuid PK
- user_id       uuid FK → users.id        # product hook
- name          text
- status        text   # draft | sending | done | paused
- template_subject  text
- template_body     text   # contains {name},{company},{role},{ai_opener}
- ai_prompt     text   # personalization instruction
- daily_limit   int    # default 40
- created_at    timestamptz

### leads
- id            uuid PK
- campaign_id   uuid FK → campaigns.id
- user_id       uuid FK → users.id        # product hook
- name          text
- email         text   # INDEXED (reply-matching lookup)
- company       text
- role          text
- status        text   # pending | sent | opened | replied | bounced
- created_at    timestamptz

### emails   (also serves as the job queue)
- id            uuid PK
- lead_id       uuid FK → leads.id
- campaign_id   uuid FK → campaigns.id
- user_id       uuid FK → users.id        # product hook
- sequence_step int    # 1=initial, 2=followup1, 3=followup2
- subject       text   # final after personalization
- body          text   # final after personalization
- status        text   # scheduled | sent | failed | cancelled
- scheduled_for timestamptz   # INDEXED (cron query)
- sent_at       timestamptz
- resend_id     text   # Resend's email ID (for webhook matching)
- created_at    timestamptz

### events   (append-only history)
- id            uuid PK
- email_id      uuid FK → emails.id
- lead_id       uuid FK → leads.id
- type          text   # sent | opened | replied | bounced
- occurred_at   timestamptz
- raw_payload   jsonb  # full webhook data for debugging

## Relationships
- users 1—∞ campaigns
- campaigns 1—∞ leads (Option A: leads belong to one campaign)
- leads 1—∞ emails (initial + follow-ups)
- emails 1—∞ events

## Indexes
- leads.email           (reply-matching)
- emails.scheduled_for  (cron job query)
- emails.status         (cron job query)
- foreign keys auto-indexed by Postgres

## Design notes
- emails table = job queue: cron does 
  SELECT WHERE status='scheduled' AND scheduled_for<=now()
- events = append-only audit log, never edited
- leads.status = denormalized summary for fast dashboard reads
- user_id on every table = multi-tenant product hook (single value for v1)