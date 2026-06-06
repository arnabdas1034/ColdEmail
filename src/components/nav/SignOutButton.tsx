import { signOut } from "@/actions/auth";

/**
 * Server Component — no 'use client' needed.
 * The <form action={serverAction}> pattern works without JavaScript
 * and is the recommended App Router approach for sign-out.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="mt-2 w-full text-left text-xs text-gray-400 transition-colors hover:text-gray-700"
      >
        Sign out
      </button>
    </form>
  );
}
