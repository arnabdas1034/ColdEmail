import type { NextRequest } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/utils/supabase/admin";
import { extractEmail } from "@/lib/resend";

/**
 * Resend INBOUND reply webhook (T6.7c).
 *
 * Receives email.received events — messages prospects send back to our sending
 * domain (arnaboutreach.dev) — and performs Level 1 reply-matching: map the
 * sender address to a lead and flag that lead as 'replied' (which the follow-up
 * engine reads to stop sending).
 *
 * Trigger: a SEPARATE Resend webhook endpoint pointed at this URL, subscribed
 * to email.received. Resend uses one unified (Svix) webhook system, but each
 * endpoint gets its OWN signing secret — hence RESEND_INBOUND_WEBHOOK_SECRET,
 * distinct from the outbound RESEND_WEBHOOK_SECRET.
 *
 * Idempotency (Svix at-least-once): the only mutation is the
 * pending/sent/opened/bounced → 'replied' transition, gated on the lead not
 * already being 'replied'. A duplicate delivery is a no-op.
 *
 * A reply is the strongest human signal we get, so it WINS over any prior
 * status — including 'bounced' (a soft/temporary bounce followed by a real
 * reply should still count as a reply).
 */

// A handful of fast queries; 15s is generous headroom over the 10s default.
export const maxDuration = 15;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal shape of a Resend email.received envelope. `data` carries far more
 *  (headers, text, html, attachments…) which we persist wholesale into
 *  raw_payload but don't read field-by-field here. */
type ResendInboundEvent = {
  type: string;
  created_at?: string;
  data?: {
    from?: string; // sender; may be RFC 5322 "Name <email>" or a bare address
    subject?: string;
    [key: string]: unknown;
  };
};

type MatchedLead = {
  id: string;
  user_id: string;
  status: string;
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Config ───────────────────────────────────────────────────────────────
  // Separate secret from the outbound endpoint — each Svix endpoint signs with
  // its own key. Missing → non-2xx so Resend retries until the env var is set.
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "RESEND_INBOUND_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  // ── 2. Verify Svix signature ──────────────────────────────────────────────
  // Same scheme as the outbound endpoint; verify over the EXACT raw bytes.
  const rawBody = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ResendInboundEvent;
  try {
    event = new Webhook(secret).verify(rawBody, svixHeaders) as ResendInboundEvent;
  } catch {
    // Bad/forged signature, replay, or skewed timestamp → Resend retries.
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 3. Only handle inbound received events ─────────────────────────────────
  if (event.type !== "email.received") {
    return Response.json({ ok: true, ignored: event.type });
  }

  // ── 4. Extract sender address ──────────────────────────────────────────────
  const fromRaw = event.data?.from;
  if (!fromRaw) {
    return Response.json({ ok: true, note: "payload missing data.from" });
  }
  // extractEmail strips an RFC 5322 display name: "Name <a@b.com>" → "a@b.com",
  // and passes a bare address through unchanged.
  const senderEmail = extractEmail(fromRaw).trim();

  // TODO(T6.8): if event.data.subject contains 'unsubscribe' (case-insensitive),
  // add the sender to a suppression list and skip future sends. No action in v1.

  // ── 5. Level 1 reply-match ─────────────────────────────────────────────────
  // Exact-match lookup on leads.email so it uses idx_leads_email. Matching is
  // case-sensitive (no normalization on either side) — an accepted Level 1
  // limitation; SPEC frames reply-matching as ~90% reliable.
  const supabase = createAdminClient();

  const { data: lead, error: lookupError } = await supabase
    .from("leads")
    .select("id, user_id, status")
    .eq("email", senderEmail)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    // Transient DB error — non-2xx so Resend retries.
    return Response.json(
      { error: "Lead lookup failed", detail: lookupError.message },
      { status: 500 },
    );
  }

  if (!lead) {
    // Sender isn't a campaign lead — not every inbound email is a reply.
    // Ack silently so Resend stops retrying.
    return Response.json({ ok: true, note: "no matching lead" });
  }

  const matched = lead as MatchedLead;

  // ── 6. Idempotent 'replied' transition ─────────────────────────────────────
  if (matched.status === "replied") {
    // Already recorded (Svix at-least-once). No-op, no duplicate event.
    return Response.json({ ok: true, note: "already replied" });
  }

  const occurredAt = event.created_at ?? new Date().toISOString();

  await Promise.all([
    // Reply wins over any prior status (pending/sent/opened/bounced). The neq
    // guard makes a concurrent duplicate delivery a harmless no-op.
    supabase
      .from("leads")
      .update({ status: "replied" })
      .eq("id", matched.id)
      .neq("status", "replied"),
    // Inbound reply has no outbound email → email_id is null (migration 00006).
    supabase.from("events").insert({
      email_id: null,
      lead_id: matched.id,
      user_id: matched.user_id,
      type: "replied",
      occurred_at: occurredAt,
      raw_payload: event as unknown as Record<string, unknown>,
    }),
  ]);

  return Response.json({ ok: true });
}
