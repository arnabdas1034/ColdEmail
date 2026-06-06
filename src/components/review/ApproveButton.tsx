"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveCampaign } from "@/actions/campaigns";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApproveStatus = "idle" | "confirming" | "scheduling" | { error: string };

type Props = {
  campaignId: string;
  leadCount: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ApproveButton({ campaignId, leadCount }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ApproveStatus>("idle");

  async function handleApprove() {
    setStatus("scheduling");
    const result = await approveCampaign(campaignId);
    if (result.error) {
      setStatus({ error: result.error });
    } else {
      router.push(`/dashboard/campaigns/${campaignId}`);
    }
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      >
        Approve &amp; Schedule {leadCount} email{leadCount === 1 ? "" : "s"}
      </button>
    );
  }

  if (status === "confirming") {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-700">
          Schedule all {leadCount} email{leadCount === 1 ? "" : "s"} and start
          sending tomorrow?
        </p>
        <button
          type="button"
          onClick={() => void handleApprove()}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          Yes, approve
        </button>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="rounded-lg px-4 py-1.5 text-sm text-gray-600 ring-1 ring-gray-200 transition-colors hover:ring-gray-300"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status === "scheduling") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        Scheduling emails…
      </div>
    );
  }

  // error state
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">{status.error}</p>
      <button
        type="button"
        onClick={() => setStatus("idle")}
        className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
      >
        Dismiss
      </button>
    </div>
  );
}
