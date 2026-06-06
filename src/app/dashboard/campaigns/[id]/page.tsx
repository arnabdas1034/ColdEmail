import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { StatusBadge } from "@/components/campaigns/StatusBadge";
import { DeleteButton } from "@/components/campaigns/DeleteButton";
import type { Campaign, CampaignStatus } from "@/types/db";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // Run both queries in parallel — no sequential dependency between them.
  const [{ data: raw }, { count: leadCount }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).single(),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id),
  ]);

  if (!raw) notFound();

  const campaign = raw as Campaign;

  const createdAt = new Date(campaign.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-1 flex items-center gap-3">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Campaigns
        </Link>
      </div>

      <div className="mb-2 mt-3 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{campaign.name}</h1>
        <StatusBadge status={campaign.status as CampaignStatus} />
      </div>

      <p className="mb-10 text-sm text-gray-500">
        Created {createdAt} &middot; {leadCount ?? 0} lead
        {leadCount === 1 ? "" : "s"} &middot; {campaign.daily_limit}/day limit
      </p>

      {/* ── Section cards (stubs — filled in by T6.2, T6.3, T6.5) ───── */}
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <SectionCard
          label="Leads"
          description="Import leads from a CSV file."
          href={`/dashboard/campaigns/${id}/leads`}
          task="T6.2"
          available={true}
        />
        <SectionCard
          label="Template"
          description="Write your email subject and body with {variables}."
          href={`/dashboard/campaigns/${id}/template`}
          task="T6.3"
          available={true}
        />
        <SectionCard
          label="Review & Approve"
          description="Preview AI-personalised emails and approve the send."
          href={`/dashboard/campaigns/${id}/review`}
          task="T6.5"
          available={false}
        />
      </div>

      {/* ── Danger zone ────────────────────────────────────────────────── */}
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

// ── Internal component — only used in this file ───────────────────────────────

function SectionCard({
  label,
  description,
  href,
  task,
  available,
}: {
  label: string;
  description: string;
  href: string;
  task: string;
  available: boolean;
}) {
  const body = (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-900">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      {!available && (
        <span className="mt-3 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
          {task}
        </span>
      )}
    </div>
  );

  return available ? (
    <Link
      href={href}
      className="transition-opacity hover:opacity-80"
    >
      {body}
    </Link>
  ) : (
    <div className="cursor-not-allowed opacity-60">{body}</div>
  );
}
