"use server";

/**
 * Lead Server Actions.
 *
 * Security notes:
 *  - Re-verifies session on every call (getUser(), not getSession()).
 *  - Verifies campaign ownership before any write — belt-and-suspenders on
 *    top of RLS, because the client supplies campaignId as a plain argument
 *    (not from a cookie) and must not be trusted without a DB check.
 *  - Re-validates every email server-side even though the client already
 *    parsed the CSV — never trust client-supplied data in a Server Action.
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { ParsedLead } from "@/lib/csv";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImportResult = {
  imported: number;
  skipped: number;
  error?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  const parts = email.split("@");
  return parts.length === 2 && (parts[1] ?? "").includes(".");
}

// ── importLeads ───────────────────────────────────────────────────────────────

/**
 * Bulk-inserts validated leads into the leads table.
 *
 * Returns a result object (not Promise<never>) — the Client Component needs
 * the counts to display inline without a page redirect.
 *
 * Deduplication: existing emails for the campaign are fetched first;
 * incoming rows whose email already exists are silently skipped.
 */
export async function importLeads(
  campaignId: string,
  incoming: ParsedLead[],
): Promise<ImportResult> {
  if (!campaignId || incoming.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { imported: 0, skipped: 0, error: "Not authenticated." };
  }

  // Verify the campaign exists and belongs to this user
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) {
    return { imported: 0, skipped: 0, error: "Campaign not found." };
  }

  // Fetch existing emails for this campaign to detect within-campaign dupes
  const { data: existingRows } = await supabase
    .from("leads")
    .select("email")
    .eq("campaign_id", campaignId);

  const existingEmails = new Set(
    ((existingRows ?? []) as Array<{ email: string }>).map((r) =>
      r.email.toLowerCase(),
    ),
  );

  // Filter: server-side email validation + duplicate check
  let skipped = 0;
  const toInsert: ParsedLead[] = [];

  for (const lead of incoming) {
    const email =
      typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";

    if (!email || !isValidEmail(email)) {
      skipped++;
      continue;
    }

    if (existingEmails.has(email)) {
      skipped++;
      continue;
    }

    // Add to set so duplicates within the batch itself are also caught
    existingEmails.add(email);
    toInsert.push({ ...lead, email });
  }

  if (toInsert.length === 0) {
    return { imported: 0, skipped };
  }

  const rows = toInsert.map((lead) => ({
    campaign_id: campaignId,
    user_id: user.id,
    email: lead.email,
    name: lead.name,
    company: lead.company,
    role: lead.role,
    status: "pending" as const,
  }));

  const { error } = await supabase.from("leads").insert(rows);

  if (error) {
    return { imported: 0, skipped, error: "Import failed. Please try again." };
  }

  // Revalidate the leads list and the campaign detail (lead count badge)
  revalidatePath(`/dashboard/campaigns/${campaignId}/leads`);
  revalidatePath(`/dashboard/campaigns/${campaignId}`);

  return { imported: toInsert.length, skipped };
}

// ── saveOpener ────────────────────────────────────────────────────────────────

export type SaveOpenerResult = {
  error?: string;
};

/**
 * Persists a manually edited ai_opener for a single lead.
 *
 * Called from LeadRow on textarea blur when the value has changed.
 * Empty string is normalised to null (consistent with the nullable column).
 */
export async function saveOpener(
  leadId: string,
  opener: string,
): Promise<SaveOpenerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("leads")
    .update({ ai_opener: opener.trim() || null })
    .eq("id", leadId)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to save opener." };

  return {};
}
