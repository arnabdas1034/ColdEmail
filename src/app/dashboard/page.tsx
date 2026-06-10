import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { StatusBadge } from "@/components/campaigns/StatusBadge";
import type { CampaignStatus } from "@/types/db";

// ── Local types ────────────────────────────────────────────────────────────────

type CampaignRow = { id: string; name: string; status: string; created_at: string };
type EmailRow = { id: string; campaign_id: string; status: string };
type LeadRow = { id: string; campaign_id: string };
type OutboundEvent = { type: string; email_id: string | null };
type RepliedEvent = { lead_id: string };

type CStats = {
  sent: number;
  delivered: Set<string>;
  opened: Set<string>;
  bounced: Set<string>;
  replied: Set<string>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function mkStats(): CStats {
  return {
    sent: 0,
    delivered: new Set(),
    opened: new Set(),
    bounced: new Set(),
    replied: new Set(),
  };
}

/**
 * Format a rate as a percentage string.
 * Returns "—" when the denominator is 0 (nothing to compute against).
 */
function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();

  // ── Step 1: campaigns, emails, leads — all parallel ───────────────────────
  // RLS scopes each query to the authenticated user; no explicit user_id filter
  // needed (matches the pattern in the rest of the dashboard).
  const [
    { data: campaignsRaw },
    { data: emailsRaw },
    { data: leadsRaw },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("emails").select("id, campaign_id, status"),
    supabase.from("leads").select("id, campaign_id"),
  ]);

  const campaigns = (campaignsRaw ?? []) as CampaignRow[];
  const emailRows = (emailsRaw ?? []) as EmailRow[];
  const leadRows = (leadsRaw ?? []) as LeadRow[];

  // Maps for O(1) campaign attribution during event bucketing.
  const emailIdToCid = new Map(emailRows.map((e) => [e.id, e.campaign_id]));
  const leadIdToCid = new Map(leadRows.map((l) => [l.id, l.campaign_id]));
  const allEmailIds = emailRows.map((e) => e.id);
  const allLeadIds = leadRows.map((l) => l.id);

  // ── Step 2: events — parallel, guarded against empty IN arrays ────────────
  // Outbound events (delivered/opened/bounced/complained) are matched via
  // email_id. Replied events (email_id=NULL per migration 00006) are matched
  // via lead_id — the only reliable attribution path for inbound replies.
  const [outboundEvents, repliedEvents] = await Promise.all([
    (async (): Promise<OutboundEvent[]> => {
      if (allEmailIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("type, email_id")
        .in("email_id", allEmailIds)
        .in("type", ["delivered", "opened", "bounced", "complained"]);
      return (data ?? []) as OutboundEvent[];
    })(),
    (async (): Promise<RepliedEvent[]> => {
      if (allLeadIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("lead_id")
        .in("lead_id", allLeadIds)
        .eq("type", "replied");
      return (data ?? []) as RepliedEvent[];
    })(),
  ]);

  // ── Step 3: bucket into per-campaign accumulators ─────────────────────────
  // Sets give COUNT(DISTINCT email_id / lead_id) semantics — Svix delivers
  // at-least-once, so duplicate events are absorbed here without inflating rates.
  const statsMap = new Map<string, CStats>();

  for (const e of emailRows) {
    if (e.status === "sent") {
      const s = statsMap.get(e.campaign_id) ?? mkStats();
      s.sent++;
      statsMap.set(e.campaign_id, s);
    }
  }

  for (const ev of outboundEvents) {
    if (!ev.email_id) continue;
    const cid = emailIdToCid.get(ev.email_id);
    if (!cid) continue;
    const s = statsMap.get(cid) ?? mkStats();
    if (ev.type === "delivered") s.delivered.add(ev.email_id);
    else if (ev.type === "opened") s.opened.add(ev.email_id);
    else if (ev.type === "bounced" || ev.type === "complained") s.bounced.add(ev.email_id);
    statsMap.set(cid, s);
  }

  for (const ev of repliedEvents) {
    const cid = leadIdToCid.get(ev.lead_id);
    if (!cid) continue;
    const s = statsMap.get(cid) ?? mkStats();
    s.replied.add(ev.lead_id);
    statsMap.set(cid, s);
  }

  // ── Step 4: roll up aggregate totals ─────────────────────────────────────
  let tSent = 0,
    tDelivered = 0,
    tOpened = 0,
    tBounced = 0,
    tReplied = 0;
  for (const s of statsMap.values()) {
    tSent += s.sent;
    tDelivered += s.delivered.size;
    tOpened += s.opened.size;
    tBounced += s.bounced.size;
    tReplied += s.replied.size;
  }

  const hasCampaigns = campaigns.length > 0;

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {hasCampaigns
            ? `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · all-time totals`
            : "Your campaign stats will appear here once you start sending."}
        </p>
      </div>

      {hasCampaigns ? (
        <>
          {/* ── Aggregate totals ──────────────────────────────────────────── */}
          <div className="mb-8 grid grid-cols-5 gap-3">
            <StatCard label="Sent" value={tSent} />
            <StatCard
              label="Delivered"
              value={tDelivered}
              rate={pct(tDelivered, tSent)}
              rateTip="of sent"
            />
            <StatCard
              label="~Opened"
              value={tOpened}
              rate={pct(tOpened, tDelivered)}
              rateTip="of delivered"
            />
            <StatCard
              label="Replied"
              value={tReplied}
              rate={pct(tReplied, tDelivered)}
              rateTip="of delivered"
            />
            <StatCard
              label="Bounced"
              value={tBounced}
              rate={pct(tBounced, tSent)}
              rateTip="of sent"
            />
          </div>

          {/* ── Per-campaign table ─────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3 text-left">Campaign</th>
                  <th className="px-4 py-3 text-right">Sent</th>
                  <th className="px-4 py-3 text-right">Delivered</th>
                  <th className="px-4 py-3 text-right">~Opened</th>
                  <th className="px-4 py-3 text-right">Replied</th>
                  <th className="px-4 py-3 text-right">Bounced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((c) => {
                  const s = statsMap.get(c.id);
                  const sent = s?.sent ?? 0;
                  const delivered = s?.delivered.size ?? 0;
                  const opened = s?.opened.size ?? 0;
                  const bounced = s?.bounced.size ?? 0;
                  const replied = s?.replied.size ?? 0;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/campaigns/${c.id}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <span className="font-medium text-gray-900">
                            {c.name}
                          </span>
                          <StatusBadge status={c.status as CampaignStatus} />
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-700">
                        {sent}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-700">
                        <TableCell n={delivered} rate={pct(delivered, sent)} />
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-700">
                        <TableCell n={opened} rate={pct(opened, delivered)} />
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-700">
                        <TableCell n={replied} rate={pct(replied, delivered)} />
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-700">
                        <TableCell n={bounced} rate={pct(bounced, sent)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Rate-denominator footnote — disambiguates the two different bases */}
            <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">
              ~Opened and Replied are % of delivered &middot; Bounced is % of
              sent &middot; Opens are approximate (pixel pre-fetch)
            </p>
          </div>
        </>
      ) : (
        /* ── Empty state ────────────────────────────────────────────────── */
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-900">No campaigns yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first campaign.
          </p>
          <Link
            href="/dashboard/campaigns"
            className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create campaign →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Internal components ────────────────────────────────────────────────────────

function StatCard({
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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums text-gray-900">
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

function TableCell({ n, rate }: { n: number; rate: string }) {
  return (
    <>
      {n}
      {rate !== "—" && (
        <span className="ml-1.5 text-xs font-normal text-gray-400">{rate}</span>
      )}
    </>
  );
}
