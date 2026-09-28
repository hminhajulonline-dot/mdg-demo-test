import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { hashIp, rateLimit } from "@/lib/rateLimit";
import { assertLicenseIntegrity } from "@/lib/core/license";
import { runTrackerSearch, trackerKeyStatus } from "@/lib/adobe-tracker/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODES = new Set(["search", "contributor"]);
const SORTS = new Set(["downloads", "relevance", "newest"]);
const TYPES = new Set(["all", "photo", "vector", "illustration", "video"]);
const AI_FILTERS = new Set(["all", "exclude", "only"]);
const RATE_LIMIT_PER_MINUTE = 30;

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function ownKeyOf(request: Request): string {
  return (request.headers.get("x-tracker-key") || "").trim().slice(0, 600);
}

/**
 * Adobe Tracker backend: keyword search + contributor portfolio lookup
 * with per-asset download stats. Providers (mock | apify | adobe),
 * 6h response cache and the shared daily quota all live server-side.
 * Admin session auth (this site is admin-only).
 */
export async function GET(request: Request) {
  assertLicenseIntegrity();

  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  const rl = rateLimit(`adobe-tracker:${hashIp(clientIp(request))}`, RATE_LIMIT_PER_MINUTE, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: `Too many tracker searches. Try again in ${Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))} minute(s).`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams;

  // In-tool API panel / admin key tests: status of the caller's own key.
  if (q.get("action") === "status") {
    const status = await trackerKeyStatus(ownKeyOf(request));
    return NextResponse.json({ ok: true, status });
  }

  const mode = (q.get("mode") || "search").toLowerCase();
  if (!MODES.has(mode)) {
    return NextResponse.json({ ok: false, message: "mode must be search or contributor." }, { status: 400 });
  }
  const query = (mode === "contributor" ? q.get("creatorId") || "" : q.get("q") || "").trim();
  if (!query) {
    return NextResponse.json(
      { ok: false, message: mode === "contributor" ? "creatorId is required." : "q is required." },
      { status: 400 }
    );
  }

  const numOr = (v: string | null, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  const sort = SORTS.has(q.get("sort") || "") ? (q.get("sort") as "downloads") : "downloads";
  const type = TYPES.has(q.get("type") || "") ? (q.get("type") as "all") : "all";
  const ai = AI_FILTERS.has(q.get("ai") || "") ? (q.get("ai") as "all") : "all";

  const outcome = await runTrackerSearch({
    mode: mode as "search" | "contributor",
    query,
    limit: Math.min(Math.max(numOr(q.get("limit"), 20), 1), 50),
    offset: Math.max(numOr(q.get("offset"), 0), 0),
    refresh: q.get("refresh") === "true",
    sort,
    type,
    ai,
    ownKey: ownKeyOf(request),
  });

  if (outcome.kind === "fail") {
    return NextResponse.json(outcome.body, { status: outcome.body.status });
  }
  return NextResponse.json(outcome.body);
}
