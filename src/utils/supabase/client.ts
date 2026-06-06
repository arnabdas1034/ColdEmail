import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase client.
 * Use this ONLY in components marked with "use client".
 *
 * It automatically handles authenticating the user based on browser cookies.
 */
export function createClient() {
  // We use the non-null assertion (!) because we enforce these exist in our env setup
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
