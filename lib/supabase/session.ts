/**
 * Local inspection of Supabase session cookies for the proxy fast path.
 *
 * The middleware used to call `auth.getUser()` (a network roundtrip to
 * Supabase) on EVERY page navigation, API call and Link prefetch. These
 * helpers decode the access token straight from the request cookies and
 * remember which tokens this server instance has already validated, so
 * warm requests skip the network entirely.
 */

export interface DecodedSession {
  accessToken: string;
  /** Access-token expiry as epoch SECONDS (from the JWT `exp` claim). */
  expiresAt: number;
}

const BASE64_PREFIX = "base64-";
/** Refresh slightly before actual expiry so pages never see a dead token. */
const EXPIRY_LEEWAY_SEC = 60;
/** Cap on remembered tokens per instance. */
const MAX_TRACKED = 500;

function base64UrlToString(input: string): string | null {
  try {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Read `exp` (epoch seconds) from a JWT payload WITHOUT verifying it. */
function jwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const json = base64UrlToString(parts[1]);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function parseSessionJson(json: string): DecodedSession | null {
  try {
    const data = JSON.parse(json) as { access_token?: string };
    if (typeof data.access_token !== "string" || !data.access_token) return null;
    const exp = jwtExp(data.access_token);
    if (exp === null) return null;
    return { accessToken: data.access_token, expiresAt: exp };
  } catch {
    return null;
  }
}

function decodeValue(raw: string): DecodedSession | null {
  if (raw.startsWith(BASE64_PREFIX)) {
    const json = base64UrlToString(raw.slice(BASE64_PREFIX.length));
    return json ? parseSessionJson(json) : null;
  }
  // Legacy encodings: plain JSON or bare base64url.
  const direct = parseSessionJson(raw);
  if (direct) return direct;
  const json = base64UrlToString(raw);
  return json ? parseSessionJson(json) : null;
}

function isAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") || name.includes("auth-token");
}

/**
 * Find and decode the `sb-*-auth-token` cookie, including the chunked
 * `name.0`, `name.1`, ... layout @supabase/ssr uses for large sessions.
 * Returns null when no usable session is present.
 */
export function readSessionCookie(
  cookies: ReadonlyArray<{ name: string; value: string }>
): DecodedSession | null {
  const map = new Map(cookies.map((c) => [c.name, c.value]));
  const bases = new Set<string>();
  for (const { name } of cookies) {
    if (/^sb-.+-auth-token$/.test(name)) bases.add(name);
    const chunked = name.match(/^(sb-.+-auth-token)\.\d+$/);
    if (chunked) bases.add(chunked[1]);
  }
  for (const base of bases) {
    const single = map.get(base);
    if (single) {
      const session = decodeValue(single);
      if (session) return session;
    }
    const parts: string[] = [];
    for (let i = 0; ; i++) {
      const value = map.get(`${base}.${i}`);
      if (value === undefined) break;
      parts.push(value);
    }
    if (parts.length > 0) {
      const session = decodeValue(parts.join(""));
      if (session) return session;
    }
  }
  return null;
}

/** Does this request carry any Supabase auth cookie at all? */
export function hasAuthCookie(
  cookies: ReadonlyArray<{ name: string; value: string }>
): boolean {
  return cookies.some((c) => isAuthCookieName(c.name));
}

/** Names of every Supabase auth cookie on the request (for stripping). */
export function authCookieNames(
  cookies: ReadonlyArray<{ name: string; value: string }>
): string[] {
  return cookies.filter((c) => isAuthCookieName(c.name)).map((c) => c.name);
}

// ---------------------------------------------------------------------------
// Instance-local memo of tokens the auth server already accepted.
// ---------------------------------------------------------------------------

const validated = new Map<string, number>(); // token hash -> exp (epoch sec)

/** FNV-1a 32-bit - cheap, non-cryptographic cache key. */
function hashToken(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * True when this exact access token was already validated by the auth
 * server on this instance and is not close to expiry - safe to skip the
 * getUser() network roundtrip.
 */
export function isSessionValidLocally(session: DecodedSession): boolean {
  if (session.expiresAt - EXPIRY_LEEWAY_SEC <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  return validated.has(hashToken(session.accessToken));
}

/** Record a token the auth server accepted (after a successful getUser). */
export function rememberValidatedSession(session: DecodedSession): void {
  const key = hashToken(session.accessToken);
  if (validated.has(key)) return;
  const now = Math.floor(Date.now() / 1000);
  if (validated.size >= MAX_TRACKED) {
    for (const [k, exp] of validated) {
      if (exp - EXPIRY_LEEWAY_SEC <= now) validated.delete(k);
    }
    while (validated.size >= MAX_TRACKED) {
      const oldest = validated.keys().next();
      if (oldest.done) break;
      validated.delete(oldest.value);
    }
  }
  validated.set(key, session.expiresAt);
}
