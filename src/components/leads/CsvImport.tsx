"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseLeadsCsv, type ParsedLead } from "@/lib/csv";
import { importLeads } from "@/actions/leads";

// ── State machine ─────────────────────────────────────────────────────────────

type Status =
  | { kind: "idle" }
  | { kind: "preview"; leads: ParsedLead[]; skipped: number }
  | { kind: "importing" }
  | { kind: "done"; imported: number; skipped: number }
  | { kind: "error"; message: string };

const PREVIEW_LIMIT = 10;

// ── Component ─────────────────────────────────────────────────────────────────

export function CsvImport({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // ── File selection → parse ──────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      const raw = ev.target?.result;
      if (typeof raw !== "string") {
        setStatus({ kind: "error", message: "Could not read the file." });
        return;
      }

      const result = parseLeadsCsv(raw);

      if (result.error) {
        setStatus({ kind: "error", message: result.error });
        return;
      }

      if (result.leads.length === 0) {
        setStatus({
          kind: "error",
          message:
            'No valid leads found. Check that your CSV has an "email" column with valid addresses.',
        });
        return;
      }

      setStatus({
        kind: "preview",
        leads: result.leads,
        skipped: result.skipped,
      });
    };

    reader.onerror = () => {
      setStatus({ kind: "error", message: "Failed to read the file." });
    };

    reader.readAsText(file);
  }

  // ── Import confirmed → Server Action ───────────────────────────────────────

  async function handleImport(leads: ParsedLead[]) {
    setStatus({ kind: "importing" });
    try {
      const result = await importLeads(campaignId, leads);
      if (result.error) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setStatus({
        kind: "done",
        imported: result.imported,
        skipped: result.skipped,
      });
      // Refresh server components so the leads list below shows new rows.
      // Client component state (this component) is preserved across the refresh.
      router.refresh();
    } catch {
      setStatus({
        kind: "error",
        message: "Something went wrong. Please try again.",
      });
    }
  }

  function reset() {
    setStatus({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status.kind === "idle") {
    return (
      <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white px-8 py-10 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/30">
        <svg
          className="mb-3 h-8 w-8 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <span className="mb-1 text-sm font-medium text-gray-700">
          Upload CSV
        </span>
        <span className="text-xs text-gray-400">
          Columns: name, email, company, role
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>
    );
  }

  if (status.kind === "preview") {
    const { leads, skipped } = status;
    const overflow = leads.length - PREVIEW_LIMIT;

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-4 text-sm text-gray-700">
          <span className="font-medium">{leads.length} lead{leads.length === 1 ? "" : "s"}</span> ready to import
          {skipped > 0 && (
            <span className="ml-1 text-gray-400">
              · {skipped} row{skipped === 1 ? "" : "s"} skipped (no valid email)
            </span>
          )}
        </p>

        <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.slice(0, PREVIEW_LIMIT).map((lead, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-gray-700">{lead.name ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{lead.email}</td>
                  <td className="px-4 py-2 text-gray-500">{lead.company ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{lead.role ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {overflow > 0 && (
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
              +{overflow} more row{overflow === 1 ? "" : "s"} not shown
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport(leads)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Import {leads.length} lead{leads.length === 1 ? "" : "s"} →
          </button>
        </div>
      </div>
    );
  }

  if (status.kind === "importing") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-sm text-gray-600">Importing…</span>
      </div>
    );
  }

  if (status.kind === "done") {
    const { imported, skipped } = status;
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
        <p className="text-sm font-medium text-green-800">
          Imported {imported} lead{imported === 1 ? "" : "s"}.
          {skipped > 0 && (
            <span className="ml-1 font-normal text-green-700">
              {skipped} skipped (duplicates or no email).
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-1.5 text-xs text-green-700 hover:underline"
        >
          Import another file
        </button>
      </div>
    );
  }

  // status.kind === "error"
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <p className="text-sm text-red-700">{status.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-1.5 text-xs text-red-600 hover:underline"
      >
        Try again
      </button>
    </div>
  );
}
