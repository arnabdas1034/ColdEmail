import type { NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  createResendClient,
  getFromAddress,
  getUnsubscribeEmail,
} from "@/lib/resend";

/**
 * Vercel function timeout — 30 s covers 10 sequential Resend sends (~1 s each)
 * with headroom. Without this, the default 10 s kills the batch mid-run.
 */
export const maxDuration = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

type EmailRow = {
  id: string;
  lead_id: string;
  campaign_id: string;
  user_id: string;
  subject: string | null;
  body: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max rows claimed per invocation. At 40 emails/day spread over 8 h, ~5 fire
 *  per 5-min window; 10 is a safe 2× ceiling. */
const BATCH_SIZE = 10;

/** claimed_at older than this is treated as an orphan (crash between claim and
 *  send). Keyed on claimed_at, not scheduled_for — scheduled_for is the
 *  delivery time; a backlog row in-flight could have an old scheduled_for and
 *  would be mis-reclaimed if we used that column. */
const ORPHAN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate required env vars at startup — better to fail fast with a clear
  // message than to silently skip sends mid-loop.
  const from = getFromAddress();
  // getUnsubscribeEmail checks RESEND_UNSUBSCRIBE_EMAIL first.
  // Set that to a real monitored inbox (e.g. arnabdas.10b@gmail.com) until
  // arnaboutreach.dev inbound MX is live (T6.7).
  const unsubscribeEmail = getUnsubscribeEmail(from);

  const supabase = createAdminClient();
  const resend = createResendClient();

  // ── 2. Orphan recovery ────────────────────────────────────────────────────
  // Reset rows stuck in 'sending' back to 'scheduled' so they are retried.
  // We key on claimed_at (not scheduled_for) — see migration 00004 comment.
  // Also resets NULL claimed_at rows in 'sending' (pre-migration safety net).
  const orphanCutoff = new Date(Date.now() - ORPHAN_WINDOW_MS).toISOString();
  await supabase
    .from("emails")
    .update({ status: "scheduled", claimed_at: null })
    .eq("status", "sending")
    .or(`claimed_at.lt.${orphanCutoff},claimed_at.is.null`);
  // Orphan-reaper errors are non-fatal — worst case a stuck row stays stuck
  // until the next run. Don't abort the whole invocation for this.

  // ── 3. Fetch candidate rows ───────────────────────────────────────────────
  const { data: candidates, error: candidatesError } = await supabase
    .from("emails")
    .select("id, lead_id, campaign_id, user_id, subject, body")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (candidatesError) {
    return Response.json(
      { error: "Failed to fetch scheduled emails", detail: candidatesError.message },
      { status: 500 },
    );
  }

  if (!candidates || candidates.length === 0) {
    return Response.json({ sent: 0, failed: 0, skipped: 0 });
  }

  const candidateIds = (candidates as EmailRow[]).map((e) => e.id);

  // ── 4. Atomic claim ───────────────────────────────────────────────────────
  // UPDATE WHERE id IN (...) AND status='scheduled' RETURNING id
  //
  // The AND status='scheduled' guard is the race-safety mechanism:
  //   Concurrent invocation A and B both fetch the same candidates.
  //   A's UPDATE wins — all rows flip to 'sending'. B's UPDATE matches
  //   0 rows (all already 'sending') and gets an empty RETURNING set.
  //   B proceeds with toSend=[] and sends nothing. No double-sends.
  //
  // claimed_at is set here so the orphan reaper can detect stale claims
  // by comparing claimed_at (not scheduled_for) to now()-ORPHAN_WINDOW.
  const { data: claimed, error: claimError } = await supabase
    .from("emails")
    .update({ status: "sending", claimed_at: new Date().toISOString() })
    .in("id", candidateIds)
    .eq("status", "scheduled")
    .select("id");

  if (claimError) {
    return Response.json(
      { error: "Failed to claim rows", detail: claimError.message },
      { status: 500 },
    );
  }

  const claimedIds = new Set(
    ((claimed ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const toSend = (candidates as EmailRow[]).filter((e) => claimedIds.has(e.id));

  if (toSend.length === 0) {
    // Lost the claim race — another concurrent invocation took all rows
    return Response.json({ sent: 0, failed: 0, skipped: candidateIds.length });
  }

  // ── 5. Fetch lead email addresses for claimed rows ─────────────────────────
  const leadIds = [...new Set(toSend.map((e) => e.lead_id))];
  const { data: leads } = await supabase
    .from("leads")
    .select("id, email")
    .in("id", leadIds);

  const leadEmailMap = new Map(
    ((leads ?? []) as Array<{ id: string; email: string }>).map((l) => [
      l.id,
      l.email,
    ]),
  );

  // ── 5b. Suppression lookup for the claimed batch ─────────────────────────
  const normalizeEmail = (e: string) => e.trim().toLowerCase();
  const batchUserIds = [...new Set(toSend.map((e) => e.user_id))];
  const batchAddresses = [
    ...new Set(
      toSend
        .map((e) => leadEmailMap.get(e.lead_id))
        .filter((a): a is string => !!a)
        .map(normalizeEmail),
    ),
  ];
  const suppressedSet = new Set<string>();
  if (batchAddresses.length > 0) {
    const { data: suppRows, error: suppError } = await supabase
      .from("suppressions")
      .select("user_id, email")
      .in("user_id", batchUserIds)
      .in("email", batchAddresses);
    if (suppError) {
      // Fail CLOSED: never send when the suppression list can't be verified.
      // Reset claimed rows so they retry next tick (don't lose them).
      console.error("[cron/send] suppression lookup failed, aborting batch:", suppError);
      await supabase
        .from("emails")
        .update({ status: "scheduled", claimed_at: null })
        .in("id", toSend.map((e) => e.id))
        .eq("status", "sending");
      return Response.json({ ok: false, reason: "suppression_lookup_failed", reset: toSend.length });
    }
    for (const r of (suppRows ?? []) as Array<{ user_id: string; email: string }>) {
      suppressedSet.add(`${r.user_id}|${r.email}`);
    }
  }

  // ── 6. Send each claimed email sequentially ────────────────────────────────
  // Sequential (not Promise.all) — Resend rate limit is ~2 req/s; sequential
  // ensures we never burst. Per-email try/catch isolates failures.
  let sent = 0;
  let failed = 0;

  for (const email of toSend) {
    const toAddress = leadEmailMap.get(email.lead_id);

    const normalizedTo = toAddress ? normalizeEmail(toAddress) : null;
    if (normalizedTo && suppressedSet.has(`${email.user_id}|${normalizedTo}`)) {
      await supabase.from("emails").update({ status: "cancelled" }).eq("id", email.id);
      await supabase.from("events").insert({
        email_id: email.id,
        lead_id: email.lead_id,
        user_id: email.user_id,
        type: "suppressed",
        occurred_at: new Date().toISOString(),
        raw_payload: { reason: "recipient_on_suppression_list", email: normalizedTo },
      });
      continue; // skip send for this row
    }

    if (!toAddress) {
      // Lead was deleted between claim and send
      await Promise.all([
        supabase
          .from("emails")
          .update({ status: "failed" })
          .eq("id", email.id),
        supabase.from("events").insert({
          email_id: email.id,
          lead_id: email.lead_id,
          user_id: email.user_id,
          type: "failed",
          occurred_at: new Date().toISOString(),
          raw_payload: { message: "Lead not found — may have been deleted." },
        }),
      ]);
      failed++;
      continue;
    }

    const bodyWithFooter =
      (email.body ?? "") +
      "\n\n---\n" +
      "To unsubscribe, reply to this email with UNSUBSCRIBE in the subject line.";

    try {
      // Idempotency key = email row id.
      // If send succeeds but the follow-up UPDATE (emails→'sent') fails, the
      // orphan reaper reclaims the row and retries. With this key, Resend
      // returns the original response without re-sending — kills the entire
      // double-send failure class at the source.
      // Key format: "email/<uuid>" (well within 256-char limit).
      const { data: sendData, error: sendError } = await resend.emails.send(
        {
          from,
          to: [toAddress],
          subject: email.subject ?? "(no subject)",
          text: bodyWithFooter,
          headers: {
            // RFC 2369 — enables "Unsubscribe" button in Gmail / Apple Mail.
            // List-Unsubscribe-Post (RFC 8058 one-click) intentionally omitted
            // until a real POST /unsubscribe endpoint exists — advertising it
            // without a handler would cause mail client errors.
            // TODO: add List-Unsubscribe-Post once T6.7/unsubscribe endpoint lands.
            "List-Unsubscribe": `<mailto:${unsubscribeEmail}?subject=unsubscribe>`,
          },
        },
        {
          idempotencyKey: `email/${email.id}`,
        },
      );

      if (sendError) {
        // Resend SDK v3 returns { error } instead of throwing on API errors
        throw sendError;
      }

      // ── Success ────────────────────────────────────────────────────────────
      await Promise.all([
        supabase
          .from("emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            resend_id: sendData?.id ?? null,
          })
          .eq("id", email.id),
        // Only advance lead status if still 'pending' — never downgrade a
        // lead that has already opened or replied (denormalized status guard)
        supabase
          .from("leads")
          .update({ status: "sent" })
          .eq("id", email.lead_id)
          .eq("status", "pending"),
        supabase.from("events").insert({
          email_id: email.id,
          lead_id: email.lead_id,
          user_id: email.user_id,
          type: "sent",
          occurred_at: new Date().toISOString(),
          raw_payload: sendData as unknown as Record<string, unknown> | null,
        }),
      ]);

      sent++;
    } catch (err) {
      // ── Failure: mark email failed, log full error into events ─────────────
      const errorPayload: Record<string, unknown> =
        err instanceof Error
          ? { message: err.message, name: err.name }
          : { raw: String(err) };

      await Promise.all([
        supabase
          .from("emails")
          .update({ status: "failed" })
          .eq("id", email.id),
        supabase.from("events").insert({
          email_id: email.id,
          lead_id: email.lead_id,
          user_id: email.user_id,
          type: "failed",
          occurred_at: new Date().toISOString(),
          raw_payload: errorPayload,
        }),
      ]);

      failed++;
    }
  }

  return Response.json({
    sent,
    failed,
    skipped: candidateIds.length - toSend.length,
  });
}
