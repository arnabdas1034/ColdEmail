"use server";

/**
 * Auth Server Actions.
 *
 * Module-level "use server" marks every export as a Server Action so these
 * can be imported directly into Client Components (e.g. the dashboard nav
 * sign-out button in Phase 6).
 */

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

/**
 * Signs the current user out and redirects to /login.
 *
 * supabase.auth.signOut() clears the local session cookies even when
 * server-side token revocation fails, so the redirect is unconditional —
 * the user is effectively signed out from the browser's perspective either way.
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
