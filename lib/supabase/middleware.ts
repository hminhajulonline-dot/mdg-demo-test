import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

/**
 * 1. Refreshes the Supabase auth session on every protected request.
 * 2. Gates the ENTIRE site behind authentication: only signed-in users can
 *    view any page. Authorization (admin vs regular Google account) is then
 *    enforced per-route server-side (/admin layout, /api routes).
 *
 * Speed notes (navigation perf):
 * - Public paths (/login, /auth/callback, static-ish paths) return
 *   immediately without creating an auth client - no network roundtrip.
 * - Requests without any auth cookie are treated as signed-out locally,
 *   so anonymous hits never touch the auth server.
 * - Only protected requests with an actual session cookie pay for the
 *   getUser() validation/refresh - and that result is the single source
 *   of truth the page-side checks reuse for the same request.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);

  if (isPublic) {
    return NextResponse.next({ request });
  }

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // No auth cookie at all -> signed out, decided locally with zero
  // network calls (this is the common case for bots/link previews).
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") || c.name.includes("-auth-token"));

  let user: { id: string } | null = null;
  if (hasSessionCookie) {
    // IMPORTANT: no code between client creation and getUser()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  }

  // Signed-out visitors: everything redirects to /login.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
