import type { CampaignStatus } from "@/types/db";

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  sending: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
