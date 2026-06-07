import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that are always accessible without a session.
 *
 * /auth/ must be public — the magic link lands on /auth/callback before a
 * session exists, so protecting it causes an infinite redirect loop.
 *
 * /api/cron/ is listed here as defence-in-depth only.  The primary guard is
 * the matcher below, which excludes api/cron/ entirely so the middleware
 * function never runs for those paths.  Relying solely on this prefix list
 * is fragile: getUser() still fires and a Supabase network error could cause
 * the request to fall through to the 307 redirect.
 */
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/cron/"] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Copy cookies from one response to another.
 * Used when we redirect so that any tokens Supabase refreshed during
 * getUser() are not silently dropped on the redirect response.
 */
function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  /**
   * supabaseResponse starts as a plain pass-through.  If Supabase refreshes
   * the JWT it calls setAll(), which reassigns supabaseResponse so the new
   * Set-Cookie headers are included.  We must always return supabaseResponse
   * (or propagate its cookies) — never a bare NextResponse.next() — otherwise
   * the refreshed tokens are lost and the session silently expires.
   */
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed tokens into the request so downstream
          // Server Components see them within this same request cycle.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Replace supabaseResponse so the browser receives the
          // refreshed tokens via Set-Cookie response headers.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  /**
   * getUser() — not getSession() — for server-side auth checks.
   *
   * getSession() only reads the cookie; it does not revalidate with
   * Supabase's Auth server and can be forged.  getUser() makes an
   * authenticated network call and is the only safe choice here.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Unauthenticated user on a protected route → /login ─────────────────
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirectResponse = NextResponse.redirect(loginUrl);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  // ── Authenticated user on /login → /dashboard ──────────────────────────
  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    const redirectResponse = NextResponse.redirect(dashboardUrl);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     *   _next/static  — compiled JS/CSS bundles
     *   _next/image   — image optimisation endpoint
     *   favicon.ico   — fetched by browsers constantly
     *   api/cron/     — cron routes authenticate themselves via CRON_SECRET
     *                   and must never be intercepted by session middleware.
     *                   Trailing slash ensures only /api/cron/* is excluded;
     *                   a future /api/cronjob route would still be matched.
     *                   Excluding here (not just in PUBLIC_PREFIXES) ensures
     *                   getUser() is never called on cron invocations —
     *                   preventing both the 307-to-login on missing session
     *                   and an unnecessary Supabase Auth network round-trip
     *                   on every 5-minute tick.
     *   common image extensions (svg, png, jpg, jpeg, gif, webp)
     *
     * All other API routes remain matched — they participate in session
     * refresh and will require auth checks as they are added.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
