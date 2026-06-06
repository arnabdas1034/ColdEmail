import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin-level Supabase client (Service Role).
 *
 * DANGER: This client bypasses all Row Level Security (RLS) policies.
 * Use this ONLY in secure server environments like:
 * - Vercel Cron jobs
 * - Webhook receivers (e.g., from Resend)
 * - Background queue processors
 *
 * NEVER import this file into a React component or expose it to the client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
