import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createCampaign } from "@/actions/campaigns";
import { StatusBadge } from "@/components/campaigns/StatusBadge";
import type { Campaign, CampaignStatus } from "@/types/db";

type SearchParams = Promise<{ error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: "Campaign name is required.",
  invalid_limit: "Daily limit must be a whole number between 1 and 200.",
  create_failed: "Failed to create campaign. Please try again.",
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status, daily_limit, created_at")
    .order("created_at", { ascending: false });

  const campaigns = (data ?? []) as Pick<
    Campaign,
    "id" | "name" | "status" | "daily_limit" | "created_at"
  >[];

  return (
    <div className="p-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-500">
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
        </div>
      )}

      {/* ── Create form ────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          New campaign
        </h2>
        <form action={createCampaign} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label
              htmlFor="name"
              className="mb-1.5 block text-xs font-medium text-gray-700"
            >
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Q3 outreach"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="w-36">
            <label
              htmlFor="daily_limit"
              className="mb-1.5 block text-xs font-medium text-gray-700"
            >
              Daily limit
            </label>
            <input
              id="daily_limit"
              name="daily_limit"
              type="number"
              min="1"
              max="200"
              defaultValue={40}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create
          </button>
        </form>
      </div>

      {/* ── Campaign list ──────────────────────────────────────────────── */}
      {campaigns.length > 0 ? (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {c.name}
                  </span>
                  <StatusBadge status={c.status as CampaignStatus} />
                </div>
                <span className="text-xs text-gray-400">
                  {c.daily_limit}/day
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            No campaigns yet. Create one above.
          </p>
        </div>
      )}
    </div>
  );
}
