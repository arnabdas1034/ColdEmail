import type { NextRequest } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Resend OUTBOUND event webhook (T6.7b).
 *
 * Receives delivery-lifecycle events for emails WE sent (delivered / opened /
 * bounced / complained) and records them in the append-only events log, plus a
 * guarded update of the denormalized leads.status summary.
 *
 * Trigger: configured in the Resend dashboard → Webhooks, pointed at this URL.
 * Auth: Svix HMAC signature over the raw body (RESEND_WEBHOOK_SECRET), NOT the
 *       CRON_SECRET bearer scheme — this endpoint is called by Resend, not cron.
 *
 * Idempotency (DECISIONS 2026-06-08): Svix delivers AT-LEAST-ONCE, so duplicate
 * deliveries are expected. We do NOT keep a dedupe table. Instead:
 *   - opened / delivered counts are read as COUNT(DISTINCT email_id), so a
 *     duplicate inserted event never inflates a rate.
 *   - replied / bounced are made idempotent by status-transition GUARDS on the
 *     UPDATE (a no-op the second time).
 *
 * email.sent is intentionally NOT handled here — the cron sender already writes
 * the 'sent' event at send time; subscribing would double-log it.
 */

// Webhook work is a handful of fast queries; 15s is generous headroom over the
// 10s default and well clear of any realistic DB latency.
export const maxDuration = 15;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal shape of a Resend outbound event envelope (data has more fields we
 *  persist wholesale into raw_payload but don't read individually). */
type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    [key: string]: unknown;
  };
};

type MatchedEmail = {
  id: string;
  lead_id: string;
  user_id: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Resend event type → our events.type value. Keys here are the ONLY outbound
 *  events we act on; anything else (incl. email.sent) is acked and ignored. */
const EVENT_TYPE_MAP = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

type HandledResendType = keyof typeof EVENT_TYPE_MAP;

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Config ───────────────────────────────────────────────────────────────
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Our misconfiguration. Return non-2xx so Resend keeps retrying until we set
    // the env var, rather than silently dropping real delivery events.
    return Response.json(
      { error: "RESEND_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  // ── 2. Verify Svix signature ──────────────────────────────────────────────
  // The signature is computed over the EXACT raw bytes Resend sent, so we must
  // read the unparsed body. Re-serializing parsed JSON would change bytes and
  // break verification.
  const rawBody = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(rawBody, svixHeaders) as ResendWebhookEvent;
  } catch {
    // Bad/forged signature, replay, or skewed timestamp. Non-2xx → Resend
    // retries (and a genuine attacker just keeps getting 400s).
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 3. Filter to events we act on ─────────────────────────────────────────
  if (!(event.type in EVENT_TYPE_MAP)) {
    // Includes email.sent (logged by cron) and anything we don't subscribe to.
    // 2xx so Resend marks it delivered and stops retrying.
    return Response.json({ ok: true, ignored: event.type });
  }
  const eventType = EVENT_TYPE_MAP[event.type as HandledResendType];

  const resendId = event.data?.email_id;
  if (!resendId) {
    return Response.json({ ok: true, note: "payload missing data.email_id" });
  }

  // ── 4. Match back to our email row ─────────────────────────────────────────
  const supabase = createAdminClient();

  // Uses the partial index idx_emails_resend_id (migration 00005).
  const { data: emailRow, error: lookupError } = await supabase
    .from("emails")
    .select("id, lead_id, user_id")
    .eq("resend_id", resendId)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    // Transient DB error — non-2xx so Resend retries the delivery.
    return Response.json(
      { error: "Email lookup failed", detail: lookupError.message },
      { status: 500 },
    );
  }

  if (!emailRow) {
    // Event for an email we have no record of (e.g. a row deleted, or a message
    // sent outside this app). Ack so Resend stops retrying — nothing to record.
    return Response.json({ ok: true, note: "no matching email row" });
  }

  const { id: emailId, lead_id: leadId, user_id: userId } =
    emailRow as MatchedEmail;
  // Use Resend's event timestamp for the audit log when present.
  const occurredAt = event.created_at ?? new Date().toISOString();

  // ── 5. Persist event + guarded status transition (synchronous) ─────────────
  const writes: Array<PromiseLike<unknown>> = [
    // Append-only history. Duplicates are tolerated by design (see file header).
    supabase.from("events").insert({
      email_id: emailId,
      lead_id: leadId,
      user_id: userId,
      type: eventType,
      occurred_at: occurredAt,
      raw_payload: event as unknown as Record<string, unknown>,
    }),
  ];

  if (event.type === "email.opened") {
    // Upgrade to 'opened' ONLY from 'sent'. The guard prevents downgrading a
    // lead that already 'replied' (or 'bounced') back to 'opened' — open events
    // can arrive late/repeatedly thanks to pixel pre-fetch + at-least-once.
    writes.push(
      supabase
        .from("leads")
        .update({ status: "opened" })
        .eq("id", leadId)
        .eq("status", "sent"),
    );
  } else if (
    event.type === "email.bounced" ||
    event.type === "email.complained"
  ) {
    // Mark bounced, but NEVER overwrite a 'replied' lead — a reply is a stronger,
    // human-confirmed signal than a downstream bounce/complaint. The neq guard
    // also makes the repeat delivery a harmless no-op.
    writes.push(
      supabase
        .from("leads")
        .update({ status: "bounced" })
        .eq("id", leadId)
        .neq("status", "replied"),
    );

    // ── Suppression: permanent bounce or spam complaint → never send again ────
    const recipient = (event.data as { to?: string[] }).to?.[0];
    const bounceType = (event.data as { bounce?: { type?: string } }).bounce?.type;
    const shouldSuppress =
      eventType === "complained" ||
      (eventType === "bounced" && bounceType === "Permanent");
    if (shouldSuppress && recipient) {
      // Transient/Undetermined bounces are intentionally NOT suppressed.
      writes.push(
        supabase.from("suppressions").upsert(
          {
            user_id: userId,
            email: recipient.trim().toLowerCase(),
            reason: eventType === "complained" ? "complaint" : "bounce",
            source: "resend_webhook",
            lead_id: leadId,
            raw_payload: event as unknown as Record<string, unknown>,
          },
          { onConflict: "user_id,email", ignoreDuplicates: true },
        ),
      );
    }
  }
  // email.delivered: event row only, no leads.status change.

  await Promise.all(writes);

  return Response.json({ ok: true });
}
