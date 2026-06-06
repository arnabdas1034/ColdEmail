import Anthropic from "@anthropic-ai/sdk";

/**
 * Returns a configured Anthropic client.
 *
 * The SDK reads ANTHROPIC_API_KEY from the environment automatically.
 * We throw early with a clear message rather than letting the SDK fail
 * mid-request with a cryptic auth error.
 *
 * This module is server-only — it must never be imported from client
 * components or any file that ships to the browser.
 */
export function createAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and Vercel environment variables.",
    );
  }
  return new Anthropic();
}
