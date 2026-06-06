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
