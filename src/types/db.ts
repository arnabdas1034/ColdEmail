/**
 * Hand-maintained TypeScript types mirroring the live Supabase schema.
 *
 * These are not auto-generated (no Supabase codegen configured yet).
 * They are used as explicit type annotations and casts throughout the app
 * to prevent `any` from propagating in our own code.
 *
 * Source of truth: supabase/migrations/00001_init.sql
 */

// ── Status / event literal unions ────────────────────────────────────────────

export type CampaignStatus = "draft" | "sending" | "done" | "paused";
export type LeadStatus = "pending" | "sent" | "opened" | "replied" | "bounced";
export type EmailStatus = "scheduled" | "sent" | "failed" | "cancelled";
export type EventType = "sent" | "opened" | "replied" | "bounced";

// ── Table row types ───────────────────────────────────────────────────────────

export type Campaign = {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  template_subject: string | null;
  template_body: string | null;
  ai_prompt: string | null;
  daily_limit: number;
  created_at: string;
};

export type Lead = {
  id: string;
  campaign_id: string;
  user_id: string;
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
  status: LeadStatus;
  created_at: string;
};

export type Email = {
  id: string;
  lead_id: string;
  campaign_id: string;
  user_id: string;
  sequence_step: number;
  subject: string | null;
  body: string | null;
  status: EmailStatus;
  scheduled_for: string;
  sent_at: string | null;
  resend_id: string | null;
  created_at: string;
};

export type Event = {
  id: string;
  email_id: string;
  lead_id: string;
  user_id: string;
  type: EventType;
  occurred_at: string;
  raw_payload: Record<string, unknown> | null;
};
