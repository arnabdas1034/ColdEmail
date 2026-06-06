"use client";

import { useState } from "react";
import { substituteAll } from "@/lib/template";
import { saveOpener } from "@/actions/leads";
import { regenerateOpener } from "@/actions/ai";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadData = {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
  ai_opener: string | null;
};

type Props = {
  campaignId: string;
  lead: LeadData;
  templateSubject: string;
  templateBody: string;
};

type SaveStatus = "idle" | "saving" | "saved" | { error: string };
type RegenStatus = "idle" | "loading" | { error: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function LeadRow({
  campaignId,
  lead,
  templateSubject,
  templateBody,
}: Props) {
  const [opener, setOpener] = useState(lead.ai_opener ?? "");
  // savedOpener tracks the last value confirmed in the DB — used to detect
  // unsaved edits and avoid unnecessary saves on blur
  const [savedOpener, setSavedOpener] = useState(lead.ai_opener ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [regenStatus, setRegenStatus] = useState<RegenStatus>("idle");
  const [expanded, setExpanded] = useState(false);

  const hasOpener = opener.trim() !== "";
  const isDirty = opener !== savedOpener;

  // Compute live preview from current state — reruns on every opener change
  const vars = {
    name: lead.name,
    company: lead.company,
    role: lead.role,
    ai_opener: opener || null,
  };
  const previewSubject = substituteAll(templateSubject, vars);
  const previewBody = substituteAll(templateBody, vars);

  // ── Save opener on blur ──────────────────────────────────────────────────

  async function handleBlur() {
    if (!isDirty) return;
    setSaveStatus("saving");
    const result = await saveOpener(lead.id, opener);
    if (result.error) {
      setSaveStatus({ error: result.error });
    } else {
      setSavedOpener(opener);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }

  // ── Regenerate opener ────────────────────────────────────────────────────

  async function handleRegenerate() {
    setRegenStatus("loading");
    const result = await regenerateOpener(campaignId, lead.id);
    if (result.error) {
      setRegenStatus({ error: result.error });
    } else if (result.opener) {
      // Sync both state and savedOpener — regen action already persisted to DB
      setOpener(result.opener);
      setSavedOpener(result.opener);
      setSaveStatus("idle");
      setRegenStatus("idle");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isRegenerating = regenStatus === "loading";

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        hasOpener ? "border-gray-200" : "border-amber-200"
      }`}
    >
      {/* Row header ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4">
        {/* Status dot */}
        <div
          className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
            hasOpener ? "bg-green-400" : "bg-amber-400"
          }`}
        />

        {/* Lead info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {lead.name ?? "(no name)"}{" "}
            <span className="font-normal text-gray-400">
              &lt;{lead.email}&gt;
            </span>
          </p>
          {(lead.company ?? lead.role) && (
            <p className="truncate text-xs text-gray-400">
              {[lead.role, lead.company].filter(Boolean).join(" @ ")}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Save status indicator */}
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-400">Saving…</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600">✓ Saved</span>
          )}
          {typeof saveStatus === "object" && (
            <span className="text-xs text-red-600">{saveStatus.error}</span>
          )}

          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={isRegenerating}
            className="rounded-md px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:ring-gray-300 disabled:opacity-50"
          >
            {isRegenerating ? "…" : "Regenerate"}
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:ring-gray-300"
          >
            {expanded ? "Hide" : "Preview"}
          </button>
        </div>
      </div>

      {/* Regen error */}
      {typeof regenStatus === "object" && (
        <p className="px-4 pb-2 text-xs text-red-600">{regenStatus.error}</p>
      )}

      {/* Opener textarea ──────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 px-4 py-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          AI Opener{isDirty && !isRegenerating && (
            <span className="ml-1 text-amber-500">· unsaved</span>
          )}
        </label>
        <textarea
          value={opener}
          onChange={(e) => setOpener(e.target.value)}
          onBlur={() => void handleBlur()}
          rows={2}
          placeholder="No opener generated — go back and generate openers first."
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Email preview ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
          <div className="mb-3 text-xs">
            <span className="font-medium text-gray-600">Subject </span>
            <span className="text-gray-700">
              {previewSubject || (
                <span className="italic text-gray-300">(empty)</span>
              )}
            </span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {previewBody || (
              <span className="italic text-gray-300">(empty body)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
