/**
 * Template substitution utilities.
 *
 * Pure functions — no server imports, no side-effects.
 * Safe to import from both server modules (actions, cron) and client
 * components (LeadRow live preview).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimum fields needed for template substitution.
 * A full Lead row satisfies this structurally; so does any fetched subset
 * that includes these four columns.
 */
export type LeadVars = {
  name: string | null;
  company: string | null;
  role: string | null;
  ai_opener: string | null;
};

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Replaces all four supported variables in a template string.
 * Absent fields (null) substitute to an empty string — the email still
 * sends; downstream prose just omits the placeholder.
 *
 * split/join is used instead of String.replace() to replace ALL occurrences
 * without a global regex (avoids the g-flag footgun with special characters).
 */
export function substituteAll(template: string, vars: LeadVars): string {
  return template
    .split("{name}").join(vars.name ?? "")
    .split("{company}").join(vars.company ?? "")
    .split("{role}").join(vars.role ?? "")
    .split("{ai_opener}").join(vars.ai_opener ?? "");
}

/**
 * Returns true if the template string contains the {ai_opener} placeholder.
 * Used to decide whether to hard-block approval when openers are missing.
 */
export function usesAiOpener(template: string): boolean {
  return template.includes("{ai_opener}");
}
