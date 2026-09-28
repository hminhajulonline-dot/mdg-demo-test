import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TRACKER_SETTINGS,
  type TrackerQuota,
  type TrackerSettings,
} from "./types";
import { mockSearch } from "./mock";
import {
  ProviderError,
  adobeOfficialSearch,
  apifySearch,
  getTrackerStatus,
  type TrackerKeyStatus,
} from "./providers";

/**
 * Adobe Tracker server orchestration: settings, site key pool, response
 * cache, shared daily quota and provider dispatch. Ported from CSV
 * Tree's api/adobe-tracker.js onto Supabase (service role only).
 */

const CACHE_TTL_MS = Number(process.env.ADOBE_TRACKER_CACHE_TTL || 6 * 3600) * 1000;
const BASE_PROVIDER = String(process.env.ADOBE_TRACKER_PROVIDER || "mock").toLowerCase();
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";

/** Row shape of the single-row adobe_tracker_settings table. */
function normalizeSettings(cfg: unknown): TrackerSettings {
  const raw = (cfg && typeof cfg === "object" ? cfg : {}) as Partial<TrackerSettings>;
  const d = DEFAULT_TRACKER_SETTINGS;
  const num = (v: unknown, fb: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    enabled: raw.enabled !== false,
    dailySearches: num(raw.dailySearches, d.dailySearches, -1, 100_000),
    resultsPerSearch: num(raw.resultsPerSearch, d.resultsPerSearch, 1, 50),
    contributorEnabled: raw.contributorEnabled !== false,
    apiSource: raw.apiSource === "admin" || raw.apiSource === "user" ? raw.apiSource : "auto",
    byoEnabled: raw.byoEnabled !== false,
    apiPanelEnabled: raw.apiPanelEnabled !== false,
    byoTitle: typeof raw.byoTitle === "string" && raw.byoTitle ? raw.byoTitle : d.byoTitle,
    byoMessage: typeof raw.byoMessage === "string" && raw.byoMessage ? raw.byoMessage : d.byoMessage,
    byoGuide: typeof raw.byoGuide === "string" && raw.byoGuide ? raw.byoGuide : d.byoGuide,
    byoGuideUrl:
      typeof raw.byoGuideUrl === "string" ? raw.byoGuideUrl : d.byoGuideUrl,
  };
}

export async function getTrackerSettings(): Promise<TrackerSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("adobe_tracker_settings")
      .select("cfg")
      .eq("id", 1)
      .maybeSingle();
    return normalizeSettings(data?.cfg);
  } catch {
    return { ...DEFAULT_TRACKER_SETTINGS };
  }
}

export async function saveTrackerSettings(cfg: Partial<TrackerSettings>): Promise<void> {
  const admin = createAdminClient();
  const merged = normalizeSettings({ ...(await getTrackerSettings()), ...cfg });
  const { error } = await admin
    .from("adobe_tracker_settings")
    .upsert({ id: 1, cfg: merged, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export interface SiteKey {
  id: string;
  label: string;
  key: string;
  active?: boolean;
}

/** Active pool keys (always fresh so admin edits apply immediately) + env fallback. */
export async function getSiteKeys(): Promise<SiteKey[]> {
  const keys: SiteKey[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("adobe_tracker_keys")
      .select("id, label, key, active")
      .order("created_at", { ascending: true });
    for (const k of data || []) {
      if (k.key && k.active !== false) {
        keys.push({ id: String(k.id), label: String(k.label || ""), key: String(k.key) });
      }
    }
  } catch {
    /* fall through to env */
  }
  if (APIFY_TOKEN && !keys.some((k) => k.key === APIFY_TOKEN)) {
    keys.unshift({ id: "env", label: "Server env", key: APIFY_TOKEN });
  }
  return keys;
}

/* ── Cache ─────────────────────────────────────────────────── */

function cacheKey(
  mode: string,
  query: string,
  limit: number,
  offset: number,
  sort: string,
  type: string,
  ai: string,
  provider: string
): string {
  return createHash("sha1")
    .update(`${mode}|${query}|${limit}|${offset}|${sort}|${type}|${ai}|${provider}`)
    .digest("hex");
}

interface CacheHit {
  payload: Record<string, unknown>;
  updatedAt: number;
}

async function readCache(key: string): Promise<CacheHit | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("adobe_tracker_cache")
      .select("payload, updated_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    const updatedAt = new Date(data.updated_at).getTime();
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > CACHE_TTL_MS) return null;
    return { payload: (data.payload || {}) as Record<string, unknown>, updatedAt };
  } catch {
    return null; // cache is best-effort
  }
}

async function writeCache(key: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("adobe_tracker_cache")
      .upsert({ cache_key: key, payload, updated_at: new Date().toISOString() });
  } catch {
    /* best-effort */
  }
}

/* ── Daily quota (shared site counter, UTC day) ────────────── */

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getUsage(day: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("adobe_tracker_usage")
      .select("searches")
      .eq("day", day)
      .maybeSingle();
    return data ? Number(data.searches) || 0 : 0;
  } catch {
    return 0;
  }
}

async function incUsage(day: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const used = await getUsage(day);
    await admin
      .from("adobe_tracker_usage")
      .upsert({ day, searches: used + 1, updated_at: new Date().toISOString() });
  } catch {
    /* best-effort */
  }
}

/* ── Handler ───────────────────────────────────────────────── */

export interface SearchRequest {
  mode: "search" | "contributor";
  query: string;
  limit: number;
  offset: number;
  refresh: boolean;
  sort: "downloads" | "relevance" | "newest";
  type: "all" | "photo" | "vector" | "illustration" | "video";
  ai: "all" | "exclude" | "only";
  /** Caller's own Apify key (BYO), from the x-tracker-key header. */
  ownKey?: string;
}

export interface TrackerEnvelope {
  ok: true;
  assets: unknown[];
  total: number;
  approximate: boolean;
  stats: unknown;
  hasMore: boolean;
  totalExact: boolean;
  updatedAt: number;
  cached: boolean;
  provider: string;
  byo: boolean;
  quota: TrackerQuota;
}

export interface TrackerFailure {
  ok: false;
  status: number;
  code?: string;
  message: string;
  byoRequired?: boolean;
  quota?: TrackerQuota;
}

type TrackerOutcome =
  | { kind: "ok"; body: TrackerEnvelope }
  | { kind: "fail"; body: TrackerFailure };

export async function runTrackerSearch(req: SearchRequest): Promise<TrackerOutcome> {
  const cfg = await getTrackerSettings();

  if (!cfg.enabled) {
    return {
      kind: "fail",
      body: { ok: false, status: 403, message: "Adobe Tracker is disabled by the admin." },
    };
  }
  if (req.mode === "contributor" && !cfg.contributorEnabled) {
    return {
      kind: "fail",
      body: {
        ok: false,
        status: 403,
        code: "contributor-disabled",
        message: "Contributor search is not available.",
      },
    };
  }

  const effLimit = Math.min(req.limit, cfg.resultsPerSearch);
  const dailyLimit = cfg.dailySearches;
  const ownKey = (req.ownKey || "").trim();
  const ownKeyAllowed = cfg.byoEnabled && !!ownKey;
  const apiSource = cfg.apiSource;

  const quota: TrackerQuota = {
    limit: dailyLimit,
    used: 0,
    remaining: dailyLimit === -1 ? null : dailyLimit,
    unlimited: dailyLimit === -1,
  };

  if (apiSource === "user" && !ownKey) {
    return {
      kind: "fail",
      body: {
        ok: false,
        status: 403,
        code: "own-key-required",
        byoRequired: cfg.byoEnabled,
        message: "This tracker runs on your own API key. Add one to continue.",
        quota,
      },
    };
  }

  // Resolve whose key serves this search (site pool vs own key).
  const siteKeys = await getSiteKeys();
  let serveTokens = siteKeys.map((k) => k.key);
  let useUserKey = apiSource === "user";
  let effectiveProvider = BASE_PROVIDER;
  if (serveTokens.length && effectiveProvider === "mock") effectiveProvider = "apify";

  const day = todayKey();
  if (dailyLimit !== -1) {
    const used = await getUsage(day);
    quota.used = used;
    quota.remaining = Math.max(0, dailyLimit - used);
    if (used >= dailyLimit) {
      if (apiSource !== "admin" && ownKeyAllowed) {
        serveTokens = [ownKey];
        useUserKey = true;
      } else {
        return {
          kind: "fail",
          body: {
            ok: false,
            status: 429,
            code: "quota-exhausted",
            byoRequired: cfg.byoEnabled && apiSource !== "admin",
            message:
              cfg.byoEnabled && apiSource !== "admin"
                ? "Daily search limit reached. Add your own API key to keep going."
                : "Daily search limit reached. Try again tomorrow.",
            quota,
          },
        };
      }
    } else {
      await incUsage(day);
      quota.used = used + 1;
      quota.remaining = Math.max(0, dailyLimit - used - 1);
    }
    if (!serveTokens.length && ownKey && apiSource === "auto") {
      serveTokens = [ownKey];
      useUserKey = true;
    }
  } else if (apiSource === "auto" && !serveTokens.length && ownKey) {
    // Unlimited quota but no site key - fall back to the caller's own key.
    serveTokens = [ownKey];
    useUserKey = true;
  }
  if (apiSource === "admin") useUserKey = false;

  const providerLabel = useUserKey ? "apify" : effectiveProvider;
  const key =
    cacheKey(
      req.mode,
      req.query.toLowerCase(),
      effLimit,
      req.offset,
      req.sort,
      req.type,
      req.ai,
      providerLabel
    ) + (useUserKey ? "|own" : "");

  if (!req.refresh) {
    const hit = await readCache(key);
    if (hit) {
      const p = hit.payload as Partial<TrackerEnvelope>;
      return {
        kind: "ok",
        body: {
          ok: true,
          assets: p.assets ?? [],
          total: p.total ?? 0,
          approximate: !!p.approximate,
          stats: p.stats ?? null,
          hasMore: !!p.hasMore,
          totalExact: !!p.totalExact,
          updatedAt: p.updatedAt ?? 0,
          cached: true,
          provider: providerLabel,
          byo: useUserKey,
          quota,
        },
      };
    }
  }

  try {
    let result;
    if (useUserKey) {
      result = await apifySearch(req.mode, req.query, effLimit, req.offset, req, [ownKey]);
    } else if (effectiveProvider === "apify") {
      result = await apifySearch(req.mode, req.query, effLimit, req.offset, req, serveTokens);
    } else if (effectiveProvider === "adobe") {
      result = await adobeOfficialSearch(req.mode, req.query, effLimit, req.offset, req);
    } else {
      result = mockSearch(req.mode, req.query, effLimit, req.offset, req);
    }
    const payload = {
      assets: result.assets,
      total: result.total,
      approximate: !!result.approximate,
      stats: result.stats ?? null,
      hasMore: !!result.hasMore,
      totalExact: !!result.totalExact,
      updatedAt: Date.now(),
    };
    await writeCache(key, payload);
    return {
      kind: "ok",
      body: {
        ok: true,
        ...payload,
        cached: false,
        provider: providerLabel,
        byo: useUserKey,
        quota,
      },
    };
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Tracker provider failed.";
    return {
      kind: "fail",
      body: { ok: false, status, message, quota },
    };
  }
}

/** Connection/usage status for the in-tool API panel and admin key tests. */
export async function trackerKeyStatus(key: string): Promise<TrackerKeyStatus> {
  const trimmed = (key || "").trim();
  if (!trimmed) return { connected: false };
  try {
    return await getTrackerStatus(trimmed);
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : "Status check failed." };
  }
}
