import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { usesAiOpener } from "@/lib/template";
import { LeadRow } from "@/components/review/LeadRow";
import { ApproveButton } from "@/components/review/ApproveButton";
import type { Campaign, CampaignStatus } from "@/types/db";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rawCampaign }, { data: rawLeads }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).single(),
    supabase
      .from("leads")
      .select("id, name, email, company, role, ai_opener")
      .eq("campaign_id", id)
      .order("created_at"),
  ]);

  if (!rawCampaign) notFound();

  const campaign = rawCampaign as Campaign;
  const leads = (rawLeads ?? []) as Array<{
    id: string;
    name: string | null;
    email: string;
    company: string | null;
    role: string | null;
    ai_opener: string | null;
  }>;

  const templateSubject = campaign.template_subject ?? "";
  const templateBody = campaign.template_body ?? "";
  const needsOpeners =
    usesAiOpener(templateSubject) || usesAiOpener(templateBody);
  const missingCount = needsOpeners
    ? leads.filter((l) => !l.ai_opener).length
    : 0;

  const isSending = (campaign.status as CampaignStatus) !== "draft";

  return (
    <div className="p-8">
      <nav className="mb-6">
        <Link
          href={`/dashboard/campaigns/${id}`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← {campaign.name}
        </Link>
      </nav>

      <header className="mb-2">
        <h1 className="text-xl font-semibold text-gray-900">
          Review &amp; Approve
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {leads.length} lead{leads.length === 1 ? "" : "s"} &middot;{" "}
          {campaign.daily_limit}/day &middot; Emails send starting tomorrow
          09:00 UTC
        </p>
      </header>

      {/* Already-approved banner */}
      {isSending && (
        <div className="mb-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          This campaign is already <strong>{campaign.status}</strong> — emails
          have been scheduled.
        </div>
      )}

      {/* Missing openers warning */}
      {missingCount > 0 && (
        <div className="mb-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>
            {missingCount} lead{missingCount === 1 ? "" : "s"} missing AI
            opener
          </strong>{" "}
          — go back and generate openers before approving.
        </div>
      )}

      {/* Approve button */}
      {!isSending && (
        <div className="mb-8 mt-4">
          <ApproveButton campaignId={id} leadCount={leads.length} />
        </div>
      )}

      {/* Lead list */}
      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          No leads imported yet.{" "}
          <Link
            href={`/dashboard/campaigns/${id}/leads`}
            className="underline underline-offset-2 hover:text-gray-600"
          >
            Import leads
          </Link>{" "}
          first.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadRow
              key={lead.id}
              campaignId={id}
              lead={lead}
              templateSubject={templateSubject}
              templateBody={templateBody}
            />
          ))}
        </div>
      )}
    </div>
  );
}
