"use client";

import { Fragment, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { saveTemplate } from "@/actions/campaigns";

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | { error: string };

type Props = {
  campaignId: string;
  initialSubject: string;
  initialBody: string;
  initialAiPrompt: string;
};

// ── Variable tokens available in the template ─────────────────────────────────

const VARIABLES = [
  { token: "{name}", hint: "Lead's name" },
  { token: "{company}", hint: "Lead's company" },
  { token: "{role}", hint: "Lead's job title" },
  { token: "{ai_opener}", hint: "AI-written opener (generated in T6.4)" },
] as const;

// Example substitutions used in the live preview
const PREVIEW_SUBS: Record<string, string> = {
  "{name}": "Alex",
  "{company}": "Acme Corp",
  "{role}": "Head of Engineering",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Inserts `token` at the textarea's current cursor position.
 * Falls back to appending if the ref is not yet mounted.
 *
 * Uses selectionStart/selectionEnd (modern, unflagged) instead of the
 * deprecated execCommand('insertText') API.
 *
 * requestAnimationFrame defers setSelectionRange until after React has
 * re-rendered the textarea with the new value; without it the cursor
 * would be reset to the end.
 */
function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | null>,
  token: string,
  currentValue: string,
  setValue: (v: string) => void,
): void {
  const el = ref.current;
  if (!el) {
    setValue(currentValue + token);
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  setValue(currentValue.slice(0, start) + token + currentValue.slice(end));
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  });
}

/**
 * Substitutes example values for all variables in `text`.
 * {ai_opener} is NOT substituted here — it's rendered as a styled span
 * by renderPreviewBody so it's visually distinct from real content.
 */
function substituteRegularVars(text: string): string {
  return Object.entries(PREVIEW_SUBS).reduce(
    (acc, [token, example]) => acc.split(token).join(example),
    text,
  );
}

/**
 * Returns a React node tree where {ai_opener} tokens are replaced with a
 * styled italic span — making it obvious it's a placeholder, not real copy.
 */
function renderPreviewBody(text: string): ReactNode {
  const substituted = substituteRegularVars(text);
  const parts = substituted.split("{ai_opener}");

  if (parts.length === 1) return substituted;

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="italic text-blue-400">[AI opener]</span>
          )}
        </Fragment>
      ))}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TemplateEditor({
  campaignId,
  initialSubject,
  initialBody,
  initialAiPrompt,
}: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [aiPrompt, setAiPrompt] = useState(initialAiPrompt);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Ref for cursor-position insertion into the body textarea
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Save handler ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus("saving");
    const result = await saveTemplate(campaignId, {
      template_subject: subject.trim() || null,
      template_body: body.trim() || null,
      ai_prompt: aiPrompt.trim() || null,
    });
    if (result.error) {
      setSaveStatus({ error: result.error });
    } else {
      setSaveStatus("saved");
      // Auto-clear the "Saved" confirmation after 3s so it doesn't linger
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  // ── Derived preview values ──────────────────────────────────────────────────

  const previewSubject = substituteRegularVars(subject).replace(
    /{ai_opener}/g,
    "[AI opener]",
  );
  const hasContent = subject.trim() !== "" || body.trim() !== "";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      {/* ── Left pane: form ──────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Subject */}
        <div>
          <label
            htmlFor="subject"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Subject
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Hi {name}, quick question about {company}"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Body */}
        <div>
          <label
            htmlFor="body"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Body
          </label>
          <textarea
            id="body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder={"Hi {name},\n\n{ai_opener}\n\nI noticed {company} is..."}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* Variable chips — click to insert at cursor in body textarea */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">Insert:</span>
            {VARIABLES.map(({ token, hint }) => (
              <button
                key={token}
                type="button"
                title={hint}
                onClick={() => insertAtCursor(bodyRef, token, body, setBody)}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        {/* AI personalization prompt */}
        <div>
          <label
            htmlFor="ai-prompt"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            AI personalization prompt
          </label>
          <textarea
            id="ai-prompt"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            placeholder={
              "Write a 1-2 sentence opener that references {name}'s work at {company}. " +
              "Be conversational, not salesy."
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Claude uses this instruction to write{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
              {"{ai_opener}"}
            </code>{" "}
            for each lead in T6.4.
          </p>
        </div>

        {/* Save button + status */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveStatus === "saving"}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveStatus === "saving" ? "Saving…" : "Save template"}
          </button>

          {saveStatus === "saved" && (
            <span className="text-sm text-green-600">✓ Saved</span>
          )}

          {typeof saveStatus === "object" && (
            <span className="text-sm text-red-600">{saveStatus.error}</span>
          )}
        </div>
      </div>

      {/* ── Right pane: live preview ──────────────────────────────────── */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          Preview{" "}
          <span className="font-normal text-gray-400">
            (example values)
          </span>
        </h3>

        {hasContent ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
            {/* Email headers */}
            <div className="mb-4 space-y-1 border-b border-gray-100 pb-3 text-xs text-gray-500">
              <p>
                <span className="font-medium text-gray-700">To</span>{" "}
                Alex &lt;alex@acmecorp.com&gt;
              </p>
              <p>
                <span className="font-medium text-gray-700">Subject</span>{" "}
                {previewSubject || (
                  <span className="italic text-gray-300">(empty)</span>
                )}
              </p>
            </div>

            {/* Email body */}
            <div className="whitespace-pre-wrap leading-relaxed text-gray-700">
              {body ? (
                renderPreviewBody(body)
              ) : (
                <span className="italic text-gray-300">
                  Start typing the body…
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-400">
              Start typing to see a preview
            </p>
          </div>
        )}

        {/* Variable legend */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>
            <code className="font-mono text-gray-500">{"{name}"}</code> → Alex
          </span>
          <span>
            <code className="font-mono text-gray-500">{"{company}"}</code> → Acme Corp
          </span>
          <span>
            <code className="font-mono text-gray-500">{"{role}"}</code> → Head of Eng
          </span>
          <span>
            <code className="font-mono text-gray-500">{"{ai_opener}"}</code>{" "}
            →{" "}
            <span className="italic text-blue-400">[AI opener]</span>
          </span>
        </div>
      </div>
    </div>
  );
}
