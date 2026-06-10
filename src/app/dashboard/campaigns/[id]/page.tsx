import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { StatusBadge } from "@/components/campaigns/StatusBadge";
import { DeleteButton } from "@/components/campaigns/DeleteButton";
import { GenerateButton } from "@/components/ai/GenerateButton";
import type { Campaign, CampaignStatus } from "@/types/db";

// ── Local types ────────────────────────────────────────────────────────────────

type OutboundEvent = { type: string; email_id: string | null };
type RepliedEvent = { lead_id: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format a rate as a percentage string.
 * Returns "—" when the denominator is 0 (nothing to compute against).
 */
function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // ── Step 1: campaign, emails, leads, openers count — all parallel ─────────
  // emails: full rows needed for emailIds (events lookup) + sent count.
  // leads:  full rows needed for leadIds (replied events lookup) + lead count.
  //         Separate count-only query for openers avoids fetching ai_opener for
  //         every lead just to count non-nulls.
  const [
    { data: raw },
    { data: emailsRaw },
    { data: leadsRaw },
    { count: openersCount },
  ] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).single(),
    supabase.from("emails").select("id, status").eq("campaign_id", id),
    supabase.from("leads").select("id").eq("campaign_id", id),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .not("ai_opener", "is", null),
  ]);

  if (!raw) notFound();

  const campaign = raw as Campaign;
  const emailRows = (emailsRaw ?? []) as Array<{ id: string; status: string }>;
  const leadRows = (leadsRaw ?? []) as Array<{ id: string }>;
  const leadCount = leadRows.length;

  const emailIds = emailRows.map((e) => e.id);
  const leadIds = leadRows.map((l) => l.id);

  // ── Step 2: events — parallel, guarded against empty IN arrays ────────────
  // Outbound events are attributed via email_id.
  // Replied events have email_id=NULL (migration 00006) — attributed via lead_id.
  const [outboundEvents, repliedEvents] = await Promise.all([
    (async (): Promise<OutboundEvent[]> => {
      if (emailIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("type, email_id")
        .in("email_id", emailIds)
        .in("type", ["delivered", "opened", "bounced", "complained"]);
      return (data ?? []) as OutboundEvent[];
    })(),
    (async (): Promise<RepliedEvent[]> => {
      if (leadIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("type", "replied");
      return (data ?? []) as RepliedEvent[];
    })(),
  ]);

  // ── Step 3: aggregate tracking metrics ───────────────────────────────────
  // Sets give COUNT(DISTINCT ...) semantics — Svix at-least-once duplicates
  // are absorbed here without inflating any rate.
  const sent = emailRows.filter((e) => e.status === "sent").length;

  const deliveredSet = new Set(
    outboundEvents
      .filter((e) => e.type === "delivered" && e.email_id !== null)
      .map((e) => e.email_id as string),
  );
  const openedSet = new Set(
    outboundEvents
      .filter((e) => e.type === "opened" && e.email_id !== null)
      .map((e) => e.email_id as string),
  );
  // bounced + complained are both bad-delivery outcomes; leads.status='bounced'
  // for both, so they share a single "Bounced" bucket here.
  const bouncedSet = new Set(
    outboundEvents
      .filter(
        (e) =>
          (e.type === "bounced" || e.type === "complained") &&
          e.email_id !== null,
      )
      .map((e) => e.email_id as string),
  );
  // Replied events carry lead_id, not email_id (COUNT DISTINCT lead_id).
  const repliedSet = new Set(repliedEvents.map((e) => e.lead_id));

  const delivered = deliveredSet.size;
  const opened = openedSet.size;
  const bounced = bouncedSet.size;
  const replied = repliedSet.size;

  // Rate denominators:
  //   open_rate  = opened  / delivered  (opens are a subset of delivered)
  //   reply_rate = replied / delivered  (engagement base)
  //   bounce_rate = bounced / sent      (deliverability base; bounced ⊄ delivered)

  const createdAt = new Date(campaign.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-8">
      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div className="mb-1 flex items-center gap-3">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Campaigns
        </Link>
      </div>

      {/* ── Campaign header ───────────────────────────────────────────── */}
      <div className="mb-2 mt-3 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{campaign.name}</h1>
        <StatusBadge status={campaign.status as CampaignStatus} />
      </div>

      <p className="mb-10 text-sm text-gray-500">
        Created {createdAt} &middot; {leadCount} lead
        {leadCount === 1 ? "" : "s"} &middot; {campaign.daily_limit}/day limit
      </p>

      {/* ── Section cards ─────────────────────────────────────────────── */}
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <SectionCard
          label="Leads"
          description="Import leads from a CSV file."
          href={`/dashboard/campaigns/${id}/leads`}
        />
        <SectionCard
          label="Template"
          description="Write your email subject and body with {variables}."
          href={`/dashboard/campaigns/${id}/template`}
        />
        <SectionCard
          label="Review & Approve"
          description="Preview AI-personalised emails and approve the send."
          href={`/dashboard/campaigns/${id}/review`}
        />
      </div>

      {/* ── Tracking stats ────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Tracking</h2>
        <div className="grid grid-cols-5 gap-3">
          <TrackStat label="Sent" value={sent} />
          <TrackStat
            label="Delivered"
            value={delivered}
            rate={pct(delivered, sent)}
            rateTip="of sent"
          />
          <TrackStat
            label="~Opened"
            value={opened}
            rate={pct(opened, delivered)}
            rateTip="of delivered"
          />
          <TrackStat
            label="Replied"
            value={replied}
            rate={pct(replied, delivered)}
            rateTip="of delivered"
          />
          <TrackStat
            label="Bounced"
            value={bounced}
            rate={pct(bounced, sent)}
            rateTip="of sent"
          />
        </div>
        {sent === 0 && (
          <p className="mt-4 text-xs text-gray-400">
            Stats appear after emails start sending.
          </p>
        )}
      </div>

      {/* ── AI personalization ────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          AI Personalization
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          Claude writes a unique opener for each lead based on your prompt.
          Openers are substituted for{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
            {"{ai_opener}"}
          </code>{" "}
          in the template body.
        </p>
        <GenerateButton
          campaignId={id}
          totalLeads={leadCount}
          openersCount={openersCount ?? 0}
          hasPrompt={Boolean(campaign.ai_prompt?.trim())}
        />
      </div>

      {/* ── Danger zone ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          Danger zone
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Permanently deletes this campaign and all associated leads, emails,
          and events. This cannot be undone.
        </p>
        <DeleteButton campaignId={id} />
      </div>
    </div>
  );
}

// ── Internal components ────────────────────────────────────────────────────────

function TrackStat({
  label,
  value,
  rate,
  rateTip,
}: {
  label: string;
  value: number;
  rate?: string;
  rateTip?: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums text-gray-900">
        {value}
      </p>
      {rate !== undefined && (
        <p className="mt-0.5 text-xs text-gray-400">
          <span
            className={
              rate === "—" ? "text-gray-300" : "font-medium text-gray-600"
            }
          >
            {rate}
          </span>
          {rateTip && rate !== "—" && <span> {rateTip}</span>}
        </p>
      )}
    </div>
  );
}

function SectionCard({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
    </Link>
  );
}
