import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CsvImport } from "@/components/leads/CsvImport";
import type { Campaign, Lead, LeadStatus } from "@/types/db";

// ── Lead status badge (only used in this file) ────────────────────────────────

const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  opened: "bg-purple-100 text-purple-700",
  replied: "bg-green-100 text-green-700",
  bounced: "bg-red-100 text-red-600",
};

function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const [{ data: rawCampaign }, { data: rawLeads }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", id)
      .single(),
    supabase
      .from("leads")
      .select("id, name, email, company, role, status, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!rawCampaign) notFound();

  const campaign = rawCampaign as Pick<Campaign, "id" | "name">;
  const leads = (rawLeads ?? []) as Lead[];

  return (
    <div className="p-8">
      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href={`/dashboard/campaigns/${id}`}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          ← {campaign.name}
        </Link>
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
        {leads.length > 0 && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {leads.length}
          </span>
        )}
      </div>

      {/* ── CSV Import ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <CsvImport campaignId={id} />
      </div>

      {/* ── Leads table ──────────────────────────────────────────────── */}
      {leads.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{lead.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.email}</td>
                  <td className="px-4 py-3 text-gray-500">{lead.company ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{lead.role ?? "—"}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status as LeadStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            No leads yet — import a CSV file above.
          </p>
        </div>
      )}
    </div>
  );
}
