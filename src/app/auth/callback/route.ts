import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /auth/callback
 *
 * Landing route for Supabase magic-link sign-in (PKCE flow).
 *
 * Supabase redirects the user here after they click the magic link:
 *   https://yourapp.com/auth/callback?code=<one-time-code>
 *
 * This handler exchanges the one-time code for a session. Supabase
 * verifies the code against the code_verifier stored in the browser
 * cookie (set during signInWithOtp), then issues a JWT.  The JWT is
 * written onto the *success* response as Set-Cookie headers so the
 * browser carries it on every subsequent request.
 *
 * Error codes in redirect URLs are intentionally generic — never
 * expose Supabase's raw error message to the browser.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  /**
   * Build the success redirect first so the Supabase client can write
   * session cookies directly onto this response object.  Cookies are
   * set during exchangeCodeForSession() below via the setAll callback.
   * They only end up on successResponse — never on an error redirect —
   * which keeps the error path clean.
   */
  const successResponse = NextResponse.redirect(new URL("/dashboard", origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            successResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
  }

  return successResponse;
}
