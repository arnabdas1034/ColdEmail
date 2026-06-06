import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Narrowed to string — we control every redirect URL that sets these params.
type LoginSearchParams = Promise<{
  error?: string;
  sent?: string;
}>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Please enter a valid email address.",
  send_failed: "Couldn't send the magic link. Please try again.",
  missing_code: "Invalid sign-in link. Please request a new one.",
  auth_callback_failed: "Sign-in failed. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const { error, sent } = await searchParams;

  async function sendMagicLink(formData: FormData) {
    "use server";

    const email = formData.get("email");
    if (typeof email !== "string" || !email.includes("@")) {
      redirect("/login?error=invalid_email");
    }

    // Derive the callback URL from the incoming request headers so this
    // works on localhost, Vercel preview, and production without any env var.
    const headerStore = await headers();
    const host = headerStore.get("host") ?? "localhost:3000";
    const proto = headerStore.get("x-forwarded-proto") ?? "http";
    const emailRedirectTo = `${proto}://${host}/auth/callback`;

    const supabase = await createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (authError) {
      redirect("/login?error=send_failed");
    }

    redirect("/login?sent=1");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* App name */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cold Email</h1>
          <p className="mt-1 text-sm text-gray-500">Campaign Manager</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          {sent === "1" ? (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900">Check your inbox</h2>
              <p className="mt-2 text-sm text-gray-500">
                We sent you a magic link. Click it to sign in — no password needed.
              </p>
              <a href="/login" className="mt-5 inline-block text-sm text-blue-600 hover:underline">
                Use a different email
              </a>
            </div>
          ) : (
            /* ── Form state (default + error) ──────────────────────────── */
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
                </div>
              )}

              <form action={sendMagicLink} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Send magic link
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
