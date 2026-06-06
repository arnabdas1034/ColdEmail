"use server";

/**
 * Campaign Server Actions.
 *
 * Security notes:
 *  - Every action re-verifies the session via getUser() (not getSession()).
 *  - Supabase RLS policies enforce row-level ownership; the explicit
 *    .eq("user_id", user.id) on deleteCampaign is a belt-and-suspenders
 *    guard on top of RLS.
 *  - redirect() throws internally — it must never be called inside a
 *    try/catch block (Next.js docs requirement).
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { substituteAll, usesAiOpener } from "@/lib/template";
import type { LeadVars } from "@/lib/template";

const BASE = "/dashboard/campaigns";

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCampaign(formData: FormData): Promise<never> {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const rawLimit = formData.get("daily_limit") as string | null;
  const dailyLimit = rawLimit ? parseInt(rawLimit, 10) : 40;

  if (!name) redirect(`${BASE}?error=name_required`);
  if (Number.isNaN(dailyLimit) || dailyLimit < 1 || dailyLimit > 200)
    redirect(`${BASE}?error=invalid_limit`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name,
      daily_limit: dailyLimit,
      user_id: user.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) redirect(`${BASE}?error=create_failed`);

  redirect(`${BASE}/${data.id}`);
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * id is passed via .bind(null, campaignId) from DeleteButton (client
 * component), so it arrives as the first argument before formData.
 *
 * ON DELETE CASCADE in the schema automatically removes all child leads,
 * emails, and events — no manual cleanup needed.
 */
export async function deleteCampaign(
  id: string,
  _formData: FormData,
): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) redirect(`${BASE}/${id}?error=delete_failed`);

  redirect(BASE);
}

// ── Save template ─────────────────────────────────────────────────────────────

export type SaveTemplateData = {
  template_subject: string | null;
  template_body: string | null;
  ai_prompt: string | null;
};

export type SaveTemplateResult = {
  error?: string;
};

/**
 * Updates the template fields on a campaign.
 *
 * Returns a result object (not Promise<never>) — the TemplateEditor client
 * component needs inline success/error feedback, not a page redirect.
 *
 * Empty strings are normalised to null so the DB is never cluttered with
 * blank strings (consistent with the nullable schema columns).
 */
export async function saveTemplate(
  campaignId: string,
  data: SaveTemplateData,
): Promise<SaveTemplateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("campaigns")
    .update({
      template_subject: data.template_subject,
      template_body: data.template_body,
      ai_prompt: data.ai_prompt,
    })
    .eq("id", campaignId)
    .eq("user_id", user.id); // belt-and-suspenders on top of RLS

  if (error) return { error: "Failed to save. Please try again." };

  // Revalidate the template page so a hard-refresh shows the latest saved values
  revalidatePath(`/dashboard/campaigns/${campaignId}/template`);

  return {};
}

// ── Approve campaign ──────────────────────────────────────────────────────────

export type ApproveCampaignResult = {
  error?: string;
};

// Send window: 09:00–17:00 UTC (8 hours = 480 minutes)
const SEND_HOUR_UTC = 9;
const SEND_WINDOW_MINUTES = 8 * 60;
// Random jitter per slot: ±3 minutes (looks human, avoids perfectly regular
// intervals which are a spam-filter signal — per DECISIONS.md drip strategy)
const JITTER_HALF_RANGE = 3;

/**
 * Assembles final email content for every lead, schedules them with a
 * human-like drip (spread over 09:00–17:00 UTC, ±3 min random jitter),
 * bulk-inserts into the emails queue, and sets campaign.status = "sending".
 *
 * Hard-blocks if the template uses {ai_opener} and any lead is missing one
 * — a blank opener sent to a real prospect is unacceptable.
 *
 * Idempotency guard: only proceeds if campaign.status === "draft".
 */
export async function approveCampaign(
  campaignId: string,
): Promise<ApproveCampaignResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  // ── Fetch campaign (verify ownership + status) ─────────────────────────────
  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "id, status, template_subject, template_body, daily_limit, user_id",
    )
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) return { error: "Campaign not found." };

  if (campaign.status !== "draft") {
    return {
      error: `Campaign is already "${campaign.status}" — cannot approve again.`,
    };
  }

  // ── Fetch all leads ordered by creation time ───────────────────────────────
  const { data: rawLeads } = await supabase
    .from("leads")
    .select("id, name, email, company, role, ai_opener")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .order("created_at");

  type FetchedLead = LeadVars & { id: string; email: string };
  const leads = (rawLeads ?? []) as FetchedLead[];

  if (leads.length === 0) {
    return { error: "No leads found. Import leads first." };
  }

  // ── Hard-block: template uses {ai_opener} but some leads are missing one ──
  const templateSubject = campaign.template_subject ?? "";
  const templateBody = campaign.template_body ?? "";

  if (usesAiOpener(templateSubject) || usesAiOpener(templateBody)) {
    const missingCount = leads.filter((l) => !l.ai_opener).length;
    if (missingCount > 0) {
      return {
        error:
          `${missingCount} lead${missingCount === 1 ? "" : "s"} missing ` +
          `opener${missingCount === 1 ? "" : "s"} — generate them or ` +
          `remove those leads first.`,
      };
    }
  }

  // ── Compute scheduled_for with drip spacing + random jitter ───────────────
  const dailyLimit = campaign.daily_limit;
  const minutesPerSlot = Math.floor(SEND_WINDOW_MINUTES / dailyLimit);

  // Start: tomorrow at SEND_HOUR_UTC:00 UTC
  const dayStart = new Date();
  dayStart.setUTCDate(dayStart.getUTCDate() + 1);
  dayStart.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);

  const emailRows = leads.map((lead, i) => {
    const dayOffset = Math.floor(i / dailyLimit);
    const slotWithinDay = i % dailyLimit;
    const baseMinutes = slotWithinDay * minutesPerSlot;
    // ±JITTER_HALF_RANGE minutes — clamp to ≥0 so first email never
    // slips before the window opens
    const jitter =
      Math.floor(Math.random() * (JITTER_HALF_RANGE * 2 + 1)) -
      JITTER_HALF_RANGE;
    const slotMinutes = Math.max(0, baseMinutes + jitter);

    const scheduledFor = new Date(
      dayStart.getTime() +
        dayOffset * 24 * 60 * 60 * 1000 +
        slotMinutes * 60 * 1000,
    );

    return {
      lead_id: lead.id,
      campaign_id: campaignId,
      user_id: user.id,
      sequence_step: 1,
      subject: substituteAll(templateSubject, lead),
      body: substituteAll(templateBody, lead),
      status: "scheduled" as const,
      scheduled_for: scheduledFor.toISOString(),
    };
  });

  // ── Bulk insert into the emails queue ──────────────────────────────────────
  const { error: insertError } = await supabase
    .from("emails")
    .insert(emailRows);

  if (insertError) {
    return { error: "Failed to schedule emails. Please try again." };
  }

  // ── Flip campaign status ───────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId)
    .eq("user_id", user.id);

  if (updateError) {
    return {
      error:
        "Emails scheduled but failed to update campaign status. Refresh the page.",
    };
  }

  revalidatePath(`/dashboard/campaigns/${campaignId}`);
  revalidatePath(BASE);

  return {};
}
