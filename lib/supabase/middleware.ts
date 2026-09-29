import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  authCookieNames,
  hasAuthCookie,
  isSessionValidLocally,
  readSessionCookie,
  rememberValidatedSession,
} from "@/lib/supabase/session";

/**
 * Session proxy (Next.js 16 calls it "proxy").
 *
 * Responsibilities, in priority order:
 * 1. SPEED: warm requests (an access token this instance already saw the
 *    auth server accept) pass through with ZERO network calls. Only cold
 *    or expiring tokens pay for auth.getUser().
 * 2. AUTH: unauthenticated API calls get a 401 JSON; unauthenticated page
 *    requests pass through so the route-group gate can render the
 *    "Login Required" screen (instead of bouncing straight to /login).
 * 3. Hygiene: cookies rejected by the auth server are stripped from the
 *    forwarded request AND cleared in the browser, so downstream checks
 *    never trust a token the server has rejected.
 */

/** Pages that render without a session. "/" = the marketing home page. */
const PUBLIC_PAGES = ["/", "/login", "/auth/callback"];
/** Endpoints that must work signed-out (login POST, health probe). */
const PUBLIC_APIS = ["/api/auth", "/api/health"];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json|xml)$/.test(pathname)
  );
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_APIS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    isStaticAsset(pathname);

  if (isPublic) {
    return NextResponse.next({ request });
  }

  const isApi = pathname.startsWith("/api");

  // Signed out, decided locally with zero network calls.
  if (!hasAuthCookie(request.cookies.getAll())) {
    if (isApi) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.next({ request });
  }

  // Warm path: this token was already validated on this instance.
  const session = readSessionCookie(request.cookies.getAll());
  if (session && isSessionValidLocally(session)) {
    return NextResponse.next({ request });
  }

  // Cold path: validate (and refresh if expired) against the auth server.
  try {
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (isApi) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      }
      // Token rejected server-side: strip it from the forwarded request so
      // page-side getSession() sees a clean signed-out state, and clear it
      // from the browser so the next request takes the cheap local path.
      const badNames = authCookieNames(request.cookies.getAll());
      for (const name of badNames) request.cookies.delete(name);
      const response = NextResponse.next({ request });
      for (const name of badNames) response.cookies.delete(name);
      return response;
    }

    // Remember for the warm path (re-read: getUser may have refreshed it).
    const fresh = readSessionCookie(request.cookies.getAll());
    if (fresh) rememberValidatedSession(fresh);

    return supabaseResponse;
  } catch {
    // Auth backend unreachable/misconfigured: fail closed to a signed-out
    // pass-through (the gate screens take over) instead of a 500. Cookies
    // are left alone so a transient failure never destroys a real session.
    if (isApi) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.next({ request });
  }
}
