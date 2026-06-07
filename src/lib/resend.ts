import { Resend } from "resend";

/**
 * Returns a configured Resend client.
 * Throws early with a clear message if RESEND_API_KEY is missing.
 * Server-only — never import from client components.
 */
export function createResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local and Vercel environment variables.",
    );
  }
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Returns the verified sender address for outgoing emails.
 * Format: "Name <email@domain.com>" or bare "email@domain.com".
 * Throws early if unset — failing at startup is better than failing mid-send.
 */
export function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL is not set. Add it to .env.local and Vercel environment variables. " +
        'Example: "Cold Outreach <you@yourdomain.com>"',
    );
  }
  return from;
}

/**
 * Extracts the bare email address from a display-name address.
 * "Arnab Das <arnab@domain.com>" → "arnab@domain.com"
 * "arnab@domain.com" → "arnab@domain.com"
 * Used for List-Unsubscribe mailto: construction.
 */
export function extractEmail(address: string): string {
  const match = address.match(/<([^>]+)>/);
  return match?.[1] ?? address;
}

/**
 * Returns the email address for the List-Unsubscribe mailto: header.
 *
 * Uses RESEND_UNSUBSCRIBE_EMAIL if set — this should be a real monitored
 * inbox that can receive replies right now.
 *
 * Falls back to extracting the address from the sender (fromAddress) once
 * the sending domain has MX/inbound configured.
 *
 * TODO T6.7: once domain inbound (arnaboutreach.dev) is live, remove the
 * RESEND_UNSUBSCRIBE_EMAIL env var override and let this fall back to
 * extractEmail(fromAddress) so unsubscribes route through the domain inbox.
 */
export function getUnsubscribeEmail(fromAddress: string): string {
  return process.env.RESEND_UNSUBSCRIBE_EMAIL ?? extractEmail(fromAddress);
}
