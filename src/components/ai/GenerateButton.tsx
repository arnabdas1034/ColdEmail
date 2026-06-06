"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateOpeners } from "@/actions/ai";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerateStatus =
  | "idle"
  | "generating"
  | { generated: number; failed: number }
  | { error: string };

type Props = {
  campaignId: string;
  totalLeads: number;
  openersCount: number;
  hasPrompt: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GenerateButton({
  campaignId,
  totalLeads,
  openersCount,
  hasPrompt,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<GenerateStatus>("idle");

  const isGenerating = status === "generating";
  const allGenerated =
    typeof status === "object" &&
    "generated" in status &&
    status.failed === 0 &&
    status.generated === totalLeads;

  async function handleGenerate() {
    setStatus("generating");
    const result = await generateOpeners(campaignId);

    if (result.error) {
      setStatus({ error: result.error });
      return;
    }

    setStatus({
      generated: result.generated ?? 0,
      failed: result.failed ?? 0,
    });

    // Refresh server-rendered opener count without a full navigation
    router.refresh();
  }

  const buttonLabel = () => {
    if (isGenerating) return "Generating…";
    if (openersCount > 0 && openersCount < totalLeads) return "Regenerate all";
    if (openersCount === totalLeads && totalLeads > 0) return "Regenerate all";
    return "Generate AI openers";
  };

  return (
    <div className="space-y-3">
      {/* Progress line */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="tabular-nums">
          <span className="font-medium">{openersCount}</span>
          <span className="text-gray-400"> / {totalLeads}</span>
        </span>
        <span className="text-gray-400">openers generated</span>
        {openersCount > 0 && openersCount === totalLeads && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            all done
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalLeads > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{
              width: `${Math.round((openersCount / totalLeads) * 100)}%`,
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !hasPrompt || totalLeads === 0}
          title={
            !hasPrompt
              ? "Add an AI prompt in the Template page first"
              : totalLeads === 0
                ? "Import leads first"
                : undefined
          }
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
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
              Generating…
            </span>
          ) : (
            buttonLabel()
          )}
        </button>

        {isGenerating && (
          <span className="text-xs text-gray-400">
            This may take a minute for larger lists.
          </span>
        )}

        {!isGenerating &&
          typeof status === "object" &&
          "generated" in status && (
            <span
              className={`text-sm ${allGenerated ? "text-green-600" : "text-gray-500"}`}
            >
              {allGenerated ? (
                <>✓ All {status.generated} openers generated</>
              ) : (
                <>
                  ✓ {status.generated} generated
                  {status.failed > 0 && (
                    <span className="text-amber-600">
                      , {status.failed} failed
                    </span>
                  )}
                </>
              )}
            </span>
          )}

        {!isGenerating &&
          typeof status === "object" &&
          "error" in status && (
            <span className="text-sm text-red-600">{status.error}</span>
          )}
      </div>

      {!hasPrompt && (
        <p className="text-xs text-amber-600">
          No AI prompt set — add one in the{" "}
          <a
            href="template"
            className="underline underline-offset-2 hover:text-amber-700"
          >
            Template page
          </a>{" "}
          first.
        </p>
      )}
    </div>
  );
}
