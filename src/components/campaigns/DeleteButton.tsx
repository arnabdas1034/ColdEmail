"use client";

import { deleteCampaign } from "@/actions/campaigns";

/**
 * Client Component — required for the window.confirm guard before submit.
 *
 * Uses .bind(null, campaignId) to pre-bind the campaign id so the server
 * action receives it as the first argument (id, _formData), per the
 * Next.js docs pattern for passing extra args to Server Actions.
 */
export function DeleteButton({ campaignId }: { campaignId: string }) {
  const boundDelete = deleteCampaign.bind(null, campaignId);

  return (
    <form
      action={boundDelete}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Delete this campaign? All leads, emails, and events will be permanently removed.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Delete campaign
      </button>
    </form>
  );
}
