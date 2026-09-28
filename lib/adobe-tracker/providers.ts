import type { TrackerAi, TrackerMode, TrackerSearchResult, TrackerSort, TrackerType } from "./types";

/**
 * Live providers (apify + official Adobe API) and the shared
 * normalizer. Ported from CSV Tree's api/adobe-tracker.js.
 */

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/* ── Normalization ─────────────────────────────────────────── */

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function strList(v: unknown): string[] {
  return asArray(v)
    .map((k) => (typeof k === "string" ? k : (k as { name?: string } | null)?.name))
    .filter(Boolean)
    .slice(0, 40) as string[];
}

function catName(c: unknown): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  return (c as { name?: string }).name || "";
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeAsset(raw: any) {
  const id = raw.id ?? raw.assetId ?? raw.stock_id ?? raw.stockId;
  if (id == null) return null;
  const title = raw.title ?? raw.assetTitle ?? "Untitled";
  const creator = raw.creator_name ?? raw.creatorName ?? raw.creator ?? "";
  const creatorId = raw.creator_id ?? raw.creatorId ?? null;
  const thumbnail =
    raw.thumbnail_url ?? raw.thumbnail_500_url ?? raw.thumbUrl ?? raw.thumbnailUrl ?? "";
  const downloads = num(raw.nb_downloads ?? raw.downloadCount ?? raw.downloads);
  const views = num(raw.nb_views ?? raw.viewCount ?? raw.views);
  const category = catName(raw.category ?? raw.categoryInfo);
  const width = num(raw.width ?? raw.pixelWidth);
  const height = num(raw.height ?? raw.pixelHeight);
  const creationDate = raw.creation_date ?? raw.creationDate ?? raw.createdAt ?? "";
  const isAI = raw.is_gentech ?? raw.isGenerativeAi ?? raw.isAI ?? false;
  const keywords = strList(raw.keywords ?? raw.keywordList);
  const mediaType =
    raw.mediaType ?? raw.asset ?? raw.assetType ?? raw.content_type ?? undefined;
  const detailsUrl =
    raw.details_url ??
    raw.detailsUrl ??
    `https://stock.adobe.com/search?k=${encodeURIComponent(String(id))}`;
  return {
    id: String(id),
    title: String(title),
    creator: String(creator || ""),
    creatorId: creatorId != null ? String(creatorId) : "",
    thumbnail: String(thumbnail || ""),
    downloads,
    views,
    category: String(category || ""),
    mediaType: typeof mediaType === "string" && mediaType ? mediaType : undefined,
    width,
    height,
    creationDate: String(creationDate || ""),
    isAI: !!isAI,
    keywords,
    detailsUrl: String(detailsUrl),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SearchOpts {
  sort?: TrackerSort;
  type?: TrackerType;
  ai?: TrackerAi;
}

/* ── Apify ─────────────────────────────────────────────────── */

const APIFY_ACTOR = process.env.APIFY_ACTOR || "igolaizola~adobe-stock-scraper";

async function apifyRun(input: Record<string, unknown>, token: string): Promise<unknown[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      }
    );
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e instanceof Error && e.name === "AbortError";
    throw new ProviderError(
      timedOut
        ? "Tracker provider timed out (try a smaller limit)."
        : `Tracker provider request failed: ${e instanceof Error ? e.message : "network error"}`,
      504
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    // Surface the provider's real validation message; never key material.
    let detail = "";
    try {
      const body = await res.text();
      try {
        const j = JSON.parse(body) as { error?: { message?: string; type?: string }; message?: string };
        detail = j?.error?.message || j?.error?.type || j?.message || "";
      } catch {
        detail = body.slice(0, 200);
      }
    } catch {
      /* ignore */
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(
        "Tracker API rejected the key (HTTP 401/403). Check the key or add your own.",
        502
      );
    }
    throw new ProviderError(
      `Tracker provider rejected the request (HTTP ${res.status})${detail ? `: ${detail}` : ". Check the key and input values."}`,
      400
    );
  }
  return (await res.json().catch(() => [])) as unknown[];
}

// Try each site key in order until one succeeds (failover pool).
// A 400 means bad input - retrying other keys won't help.
async function apifyRunPool(input: Record<string, unknown>, pool: string[]): Promise<unknown[]> {
  let lastErr: unknown = null;
  for (const token of pool) {
    try {
      return await apifyRun(input, token);
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError && e.status === 400) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError("Tracker provider failed.");
}

// Exact grand totals via the official Adobe Stock API (needs ADOBE_API_KEY).
async function adobeCount(extra: Record<string, string>): Promise<number | null> {
  const ADOBE_API_KEY = process.env.ADOBE_API_KEY || "";
  if (!ADOBE_API_KEY) return null;
  const params = new URLSearchParams({
    locale: "en_US",
    "search_parameters[limit]": "1",
    "search_parameters[offset]": "0",
    ...extra,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://stock.adobe.io/Rest/Media/1/Search/Files?${params}`, {
      headers: { "x-api-key": ADOBE_API_KEY, "x-product": "MicrostockMetadataGenerator-AdobeTracker/1.0" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { nb_results?: unknown };
    const n = Number(data.nb_results);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchAdobeCounts(opts: {
  words?: string;
  creatorId?: string;
}): Promise<{ total: number; ai: number; nonAi: number } | null> {
  if (!opts.words && !opts.creatorId) return null;
  try {
    const base: Record<string, string> = opts.creatorId
      ? { "search_parameters[creator_id]": String(opts.creatorId) }
      : { "search_parameters[words]": String(opts.words || "") };
    const [total, ai] = await Promise.all([
      adobeCount(base),
      adobeCount({ ...base, "search_parameters[filters][gentech]": "true" }),
    ]);
    if (total == null) return null;
    const aiCount = ai == null ? 0 : ai;
    return { total, ai: aiCount, nonAi: Math.max(0, total - aiCount) };
  } catch {
    return null;
  }
}

export async function apifySearch(
  mode: TrackerMode,
  query: string,
  limit: number,
  offset: number,
  opts: SearchOpts,
  tokens: string[]
): Promise<TrackerSearchResult> {
  const pool = tokens.map((t) => String(t || "").trim()).filter(Boolean);
  if (!pool.length) {
    throw new ProviderError(
      "Tracker service is not configured yet. Add your own API key to continue.",
      503
    );
  }
  const sort: TrackerSort = ["downloads", "newest", "relevance"].includes(opts.sort || "")
    ? (opts.sort as TrackerSort)
    : "downloads";
  const aiParam = opts.ai === "exclude" ? "exclude" : opts.ai === "only" ? "only" : "";
  // Both actor schemas get the type key - actors ignore unknown fields.
  const typeFilter =
    opts.type && opts.type !== "all" ? { asset: opts.type, assetType: opts.type } : {};

  // Creator NAME (not a numeric ID): keyword search + exact name match.
  if (mode === "contributor" && !/^\d+$/.test(query.trim())) {
    const items = await apifyRunPool(
      { maxItems: 100, order: sort, ai: aiParam, query: query.trim(), ...typeFilter },
      pool
    );
    const q = query.trim().toLowerCase();
    const all = asArray(items)
      .map(normalizeAsset)
      .filter(
        (a): a is NonNullable<typeof a> =>
          !!a && !!a.creator && (a.creator.toLowerCase() === q || a.creator.toLowerCase().includes(q))
      );
    const assets = all.slice(offset, offset + limit);
    const sum = all.reduce((s, a) => s + (a.downloads || 0), 0);
    const aiTotal = all.filter((a) => a.isAI).length;
    return {
      assets,
      total: offset + assets.length,
      approximate: true,
      stats: {
        totalAssets: all.length,
        totalDownloads: sum,
        avgDownloads: all.length ? Math.round(sum / all.length) : 0,
        aiCount: aiTotal,
        nonAiCount: all.length - aiTotal,
        exact: false,
      },
      hasMore: all.length > offset + limit,
      totalExact: false,
    };
  }

  // Pagination with a +1 probe item: an extra returned page means more exist.
  // NOTE: creatorId must be a JSON number - the actor rejects numeric strings.
  const maxItems = Math.min(offset + limit + 1, 101);
  const input: Record<string, unknown> = {
    maxItems,
    order: sort,
    ai: aiParam,
    ...(mode === "contributor" ? { creatorId: Number(query.trim()) } : { query: query.trim() }),
    ...typeFilter,
  };
  const items = await apifyRunPool(input, pool);
  const all = asArray(items)
    .map(normalizeAsset)
    .filter((a): a is NonNullable<typeof a> => !!a);
  const hasMore = all.length > offset + limit;
  const assets = all.slice(offset, offset + limit);
  const sum = all.reduce((s, a) => s + (a.downloads || 0), 0);
  const aiTotal = all.filter((a) => a.isAI).length;
  const stats = {
    totalAssets: all.length,
    totalDownloads: sum,
    avgDownloads: all.length ? Math.round(sum / all.length) : 0,
    aiCount: aiTotal,
    nonAiCount: all.length - aiTotal,
    exact: false,
  };
  // Exact grand totals via the official API when a key exists.
  let total = offset + assets.length;
  let totalExact = false;
  if (mode === "search") {
    const c = await fetchAdobeCounts({ words: query.trim() });
    if (c) {
      total = c.total;
      totalExact = true;
      stats.aiCount = c.ai;
      stats.nonAiCount = c.nonAi;
      stats.totalAssets = c.total;
    }
  } else if (/^\d+$/.test(query.trim())) {
    const c = await fetchAdobeCounts({ creatorId: query.trim() });
    if (c) {
      total = c.total;
      totalExact = true;
      stats.aiCount = c.ai;
      stats.nonAiCount = c.nonAi;
      stats.totalAssets = c.total;
      stats.exact = true;
    }
  }
  return { assets, total, approximate: mode === "search", stats, hasMore, totalExact };
}

/* ── Official Adobe Stock API ──────────────────────────────── */

export async function adobeOfficialSearch(
  mode: TrackerMode,
  query: string,
  limit: number,
  offset: number,
  opts: SearchOpts
): Promise<TrackerSearchResult> {
  const ADOBE_API_KEY = process.env.ADOBE_API_KEY || "";
  if (!ADOBE_API_KEY) {
    throw new ProviderError("Tracker service is not configured yet.", 503);
  }
  if (mode === "contributor") {
    throw new ProviderError(
      "Contributor lookup needs the apify provider — the official Adobe API exposes no per-creator download stats.",
      400
    );
  }
  const order = opts.sort === "newest" ? "creation" : opts.sort === "relevance" ? "relevance" : "nb_downloads";
  const params = new URLSearchParams({
    locale: "en_US",
    "search_parameters[words]": query,
    "search_parameters[limit]": String(limit),
    "search_parameters[offset]": String(offset),
    "search_parameters[order]": order,
  });
  const typeMap: Record<string, string> = {
    photo: "photo",
    illustration: "illustration",
    vector: "vector",
    video: "video",
  };
  if (opts.type && typeMap[opts.type]) {
    params.set(`search_parameters[filters][content_type:${typeMap[opts.type]}]`, "1");
  }
  for (const col of [
    "id", "title", "creator_name", "creator_id", "thumbnail_500_url",
    "width", "height", "category", "keywords", "creation_date", "details_url",
  ]) {
    params.append("result_columns[]", col);
  }
  const res = await fetch(`https://stock.adobe.io/Rest/Media/1/Search/Files?${params}`, {
    headers: {
      "x-api-key": ADOBE_API_KEY,
      "x-product": "MicrostockMetadataGenerator-AdobeTracker/1.0",
    },
  });
  if (!res.ok) {
    throw new ProviderError(
      `Adobe Stock API failed (HTTP ${res.status}). Check ADOBE_API_KEY / quota.`,
      502
    );
  }
  const data = (await res.json().catch(() => ({}))) as { files?: unknown[]; nb_results?: unknown };
  const assets = asArray(data.files)
    .map(normalizeAsset)
    .filter((a): a is NonNullable<typeof a> => !!a);
  const nb = Number(data.nb_results) || assets.length;
  const counts = await fetchAdobeCounts({ words: query });
  return {
    assets,
    total: nb,
    approximate: false,
    stats: counts
      ? {
          totalAssets: counts.total,
          totalDownloads: 0,
          avgDownloads: 0,
          aiCount: counts.ai,
          nonAiCount: counts.nonAi,
          exact: false,
        }
      : null,
    hasMore: offset + limit < nb,
    totalExact: true,
  };
}

/* ── Key status (in-tool API panel + admin key test) ───────── */

interface ApifyEnvelope {
  data?: Record<string, unknown>;
  error?: number | string;
}

async function fetchApifyJson(token: string, path: string): Promise<ApifyEnvelope> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://api.apify.com/v2${path}?token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { error: res.status };
    return (await res.json().catch(() => ({}))) as ApifyEnvelope;
  } catch {
    clearTimeout(timer);
    return { error: "timeout" };
  }
}

export interface TrackerKeyStatus {
  connected: boolean;
  error?: string;
  username?: string;
  planId?: string;
  planTier?: string;
  usage?: { usedUsd: number | null; maxUsd: number | null; computeUnits: number };
  spend?: { cycleStart: string; cycleEnd: string; totalUsd: number };
}

/** Safe identity/usage status for an Apify token - never secrets. */
export async function getTrackerStatus(token: string): Promise<TrackerKeyStatus> {
  const [me, limits, usage] = await Promise.all([
    fetchApifyJson(token, "/users/me"),
    fetchApifyJson(token, "/users/me/limits"),
    fetchApifyJson(token, "/users/me/usage/monthly"),
  ]);
  if (me.error) return { connected: false };
  const u = (me.data || {}) as {
    username?: string;
    plan?: { id?: string; tier?: string };
  };
  const plan = u.plan || {};
  const lim = (limits.data || {}) as {
    current?: Record<string, unknown>;
    limits?: { maxMonthlyUsageUsd?: unknown };
  };
  const cur = lim.current || {};
  const uso = (usage.data || {}) as {
    usageCycle?: { startAt?: string; endAt?: string };
    totalUsageCreditsUsdAfterVolumeDiscount?: unknown;
  };
  const usedUsd = Number(cur.monthlyUsageUsd);
  const maxUsd = Number(lim.limits?.maxMonthlyUsageUsd);
  return {
    connected: true,
    username: u.username || "",
    planId: plan.id || "",
    planTier: plan.tier || "",
    usage: {
      usedUsd: Number.isFinite(usedUsd) ? usedUsd : null,
      maxUsd: Number.isFinite(maxUsd) ? maxUsd : null,
      computeUnits: Number(cur.monthlyActorComputeUnits) || 0,
    },
    spend: {
      cycleStart: (uso.usageCycle && uso.usageCycle.startAt) || "",
      cycleEnd: (uso.usageCycle && uso.usageCycle.endAt) || "",
      totalUsd: Number(uso.totalUsageCreditsUsdAfterVolumeDiscount) || 0,
    },
  };
}
