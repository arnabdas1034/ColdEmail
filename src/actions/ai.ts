"use server";

/**
 * AI Server Actions.
 *
 * Security notes:
 *  - All actions verify the session via getUser() (not getSession()).
 *  - createClient() is used — this is a user-triggered action, not a cron
 *    job. RLS applies; ownership is further enforced with .eq("user_id").
 *  - The Anthropic client is only instantiated here (server module).
 *    ANTHROPIC_API_KEY never reaches the browser.
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { createAnthropicClient } from "@/lib/anthropic";
import type { Lead } from "@/types/db";

const MODEL = "claude-sonnet-4-6";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenerateOpenersResult = {
  generated?: number;
  failed?: number;
  error?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Interpolates the campaign's ai_prompt template with the lead's data.
 * Missing fields fall back to empty string so the prompt still makes
 * sense — Claude handles sparse data gracefully.
 */
function buildPrompt(aiPrompt: string, lead: Lead): string {
  return aiPrompt
    .replace(/{name}/g, lead.name ?? "")
    .replace(/{company}/g, lead.company ?? "")
    .replace(/{role}/g, lead.role ?? "");
}

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Generates a personalised AI opener for every lead in the campaign.
 *
 * Runs all Claude calls concurrently (Promise.all). At the target scale of
 * ~50 leads × ~150 output tokens, this is well within claude-sonnet-4-6's
 * rate limits. Individual failures are caught and counted rather than
 * aborting the whole batch.
 *
 * After generation, leads are updated concurrently as well — each with its
 * own .update() call (safer than upsert with partial data).
 */
export async function generateOpeners(
  campaignId: string,
): Promise<GenerateOpenersResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  // ── Fetch campaign (verify ownership, get ai_prompt) ──────────────────────
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, ai_prompt")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .single();

  if (!campaign) return { error: "Campaign not found." };

  const aiPrompt = campaign.ai_prompt?.trim() ?? "";
  if (!aiPrompt) {
    return {
      error: "No AI prompt set. Add one in the Template page first.",
    };
  }

  // ── Fetch all leads for this campaign ────────────────────────────────────
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, email, company, role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id);

  if (!leads || leads.length === 0) {
    return { error: "No leads found. Import leads first." };
  }

  // ── Call Claude concurrently, one request per lead ───────────────────────
  const anthropic = createAnthropicClient();

  const generationResults = await Promise.all(
    (leads as Lead[]).map(async (lead) => {
      try {
        const message = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content:
                buildPrompt(aiPrompt, lead) +
                "\n\nWrite only the opener sentence(s). " +
                "No subject line, no greeting, no sign-off. " +
                "Output only the opener text itself.",
            },
          ],
        });

        const block = message.content[0];
        const opener =
          block.type === "text" ? block.text.trim() : null;

        return { leadId: lead.id, opener };
      } catch {
        return { leadId: lead.id, opener: null };
      }
    }),
  );

  // ── Persist generated openers (concurrent individual updates) ─────────────
  const successful = generationResults.filter(
    (r): r is { leadId: string; opener: string } => r.opener !== null,
  );

  await Promise.all(
    successful.map(({ leadId, opener }) =>
      supabase
        .from("leads")
        .update({ ai_opener: opener })
        .eq("id", leadId)
        .eq("user_id", user.id),
    ),
  );

  const failed = generationResults.length - successful.length;

  // Revalidate so the opener count on the campaign detail page refreshes
  revalidatePath(`/dashboard/campaigns/${campaignId}`);

  return { generated: successful.length, failed };
}
