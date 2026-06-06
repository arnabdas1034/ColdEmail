/**
 * Browser-safe CSV parser for lead import.
 *
 * No external dependencies. Handles the real-world edge cases that matter
 * for lead CSVs exported from Google Sheets, Excel, and CRMs:
 *
 *  - UTF-8 BOM (U+FEFF) prepended by Excel — stripped before parsing
 *  - CRLF (\r\n) and bare CR (\r) line endings — normalised to LF
 *  - Quoted fields: "Smith, Jones & Co" preserves the comma
 *  - Escaped double-quotes: "He said ""hello""" → He said "hello"
 *  - Case-insensitive header matching with common aliases
 *  - Rows with missing / invalid email are counted as skipped, not errored
 *
 * Multiline fields (a quoted field containing a literal newline) are NOT
 * supported — they don't occur in name/email/company/role CSVs in practice.
 * Normalising line endings before splitting is deliberate and correct here.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type ParsedLead = {
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
};

export type CsvParseResult = {
  leads: ParsedLead[];
  /** Rows present in the file but excluded (blank or invalid email). */
  skipped: number;
  /** Structural problem that makes the whole file unusable. Null on success. */
  error: string | null;
};

// ── Column aliases ────────────────────────────────────────────────────────────
//
// Header text is normalised before matching: lowercased, underscores → spaces,
// consecutive spaces collapsed, trimmed. So "Full_Name" → "full name".
// Hyphens are preserved so "e-mail" stays "e-mail".

const ALIASES: Record<string, readonly string[]> = {
  email: ["email", "email address", "e-mail"],
  name: ["name", "full name", "first name", "full_name"],
  company: ["company", "company name", "organization", "org", "employer"],
  role: ["role", "title", "job title", "position", "job_title"],
};

function normaliseHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchColumnKey(header: string): string | null {
  const n = normaliseHeader(header);
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if ((aliases as readonly string[]).includes(n)) return key;
  }
  return null;
}

// ── Single-row parser ─────────────────────────────────────────────────────────
//
// State machine: reads character-by-character, tracks whether we are inside
// a quoted field. Commas inside quotes are treated as literal characters.
// "" inside a quoted field is an escaped double-quote (RFC 4180 §2.7).
// Whitespace outside quotes is trimmed at field boundaries.

function splitRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];

    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          // Escaped double-quote: "" → "
          current += '"';
          i++; // consume the second quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"' && current.trim() === "") {
      // Opening quote — allow optional leading whitespace before it
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  fields.push(current.trim()); // last (or only) field
  return fields;
}

// ── Email validator ───────────────────────────────────────────────────────────
//
// Intentionally minimal: must contain exactly one "@" with at least one "."
// after it. Full RFC 5322 validation is not needed for lead import purposes.

function isValidEmail(email: string): boolean {
  const parts = email.split("@");
  return parts.length === 2 && (parts[1] ?? "").includes(".");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseLeadsCsv(raw: string): CsvParseResult {
  // ① Strip UTF-8 BOM — Excel and some CRMs prepend \uFEFF to UTF-8 exports
  const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  // ② Normalise line endings: CRLF → LF, bare CR → LF
  const normalised = stripped.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ③ Split into lines, discard blank lines (including the trailing newline
  //    that most editors / export tools append)
  const lines = normalised.split("\n").filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { leads: [], skipped: 0, error: "The CSV file is empty." };
  }

  // ④ Parse header row and build a column-key → index map
  const headerFields = splitRow(lines[0]);
  const colIndex: Record<string, number> = {};

  for (let i = 0; i < headerFields.length; i++) {
    const key = matchColumnKey(headerFields[i]);
    // First match wins — ignore duplicate columns
    if (key !== null && !(key in colIndex)) {
      colIndex[key] = i;
    }
  }

  if (!("email" in colIndex)) {
    const found = headerFields.map((h) => `"${h}"`).join(", ");
    return {
      leads: [],
      skipped: 0,
      error: `CSV must have an "email" column. Columns found: ${found || "(none)"}`,
    };
  }

  // ⑤ Parse data rows
  const leads: ParsedLead[] = [];
  let skipped = 0;

  const get = (fields: string[], key: string): string | null => {
    const idx = colIndex[key];
    if (idx === undefined) return null;
    const val = (fields[idx] ?? "").trim();
    return val !== "" ? val : null;
  };

  for (let i = 1; i < lines.length; i++) {
    const fields = splitRow(lines[i]);

    const rawEmail = (fields[colIndex.email] ?? "").trim().toLowerCase();

    if (!rawEmail || !isValidEmail(rawEmail)) {
      skipped++;
      continue;
    }

    leads.push({
      email: rawEmail,
      name: get(fields, "name"),
      company: get(fields, "company"),
      role: get(fields, "role"),
    });
  }

  return { leads, skipped, error: null };
}
