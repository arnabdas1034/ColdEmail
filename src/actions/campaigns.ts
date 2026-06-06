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
