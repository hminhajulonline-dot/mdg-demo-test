"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ToolToast, { type ToolToastData } from "@/components/tools/ToolToast";
import { ageFromDate, formatCount, formatDate } from "@/lib/adobe-tracker/format";
import {
  TRACKER_AI_FILTERS,
  TRACKER_SORTS,
  TRACKER_TYPES,
  type TrackerAi,
  type TrackerAsset,
  type TrackerMode,
  type TrackerQuota,
  type TrackerSettings,
  type TrackerSort,
  type TrackerStats,
  type TrackerType,
} from "@/lib/adobe-tracker/types";

const MOOD_KEY = "adobeTrackerMoodboard";
const OWN_KEY_STORAGE = "adobeTrackerKey";

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const SPINNER = (
  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICONS = {
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  download:
    "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
  refresh:
    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  x: "M6 18L18 6M6 6l12 12",
  external:
    "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25",
  trending:
    "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  user: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  tag: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  ruler: "M3.75 5.25h16.5v13.5H3.75zM3.75 9.75h16.5M8.25 5.25v13.5",
  folder:
    "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  sparkles:
    "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
  chevron: "M19.5 8.25l-7.5 7.5-7.5-7.5",
  copy: "M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184",
  heart: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  bookmark:
    "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 011.186-.11c.35-.03.71-.054 1.076-.067",
  key: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
  arrowLeft: "M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z",
};

interface RespState {
  cached: boolean;
  provider: string;
  approximate: boolean;
  updatedAt: number;
  stats: TrackerStats | null;
  quota: TrackerQuota | null;
  byo: boolean;
  hasMore: boolean;
  totalExact: boolean;
}

const EMPTY_RESP: RespState = {
  cached: false,
  provider: "",
  approximate: false,
  updatedAt: 0,
  stats: null,
  quota: null,
  byo: false,
  hasMore: false,
  totalExact: false,
};

interface TrackerApiError {
  message: string;
  code: string;
  byoRequired: boolean;
}

interface ApiStatus {
  connected: boolean;
  error?: string;
  username?: string;
  planId?: string;
  planTier?: string;
  usage?: { usedUsd: number | null; maxUsd: number | null; computeUnits: number };
  spend?: { totalUsd: number };
}

const EMPTY_STATUS: ApiStatus = { connected: false };

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ id: string; label: string }>;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <I d={icon} className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ml-auto font-bold">{value}</span>
    </div>
  );
}

async function copyText(text: string, label: string, toast: (m: string, k?: ToolToastData["kind"]) => void) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied!`);
  } catch {
    toast("Copy failed.", "error");
  }
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdobeTrackerClient({ settings }: { settings: TrackerSettings }) {
  const [mode, setMode] = useState<TrackerMode>("search");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TrackerSort>("downloads");
  const [type, setType] = useState<TrackerType>("all");
  const [ai, setAi] = useState<TrackerAi>("all");
  const [assets, setAssets] = useState<TrackerAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [resp, setResp] = useState<RespState>(EMPTY_RESP);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TrackerAsset | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showByo, setShowByo] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [apiStatusLoading, setApiStatusLoading] = useState(false);
  const [byoKey, setByoKey] = useState("");
  const [saved, setSaved] = useState<TrackerAsset[]>([]);
  const [ownKey, setOwnKey] = useState("");
  const [toast, setToast] = useState<ToolToastData | null>(null);

  const showToast = useCallback((msg: string, kind: ToolToastData["kind"] = "success") => {
    setToast({ msg, kind });
  }, []);

  const pageSize = Math.min(50, Math.max(1, settings.resultsPerSearch || 20));

  // Moodboard + own key hydrate on the client only (SSR-safe, deferred a
  // tick so the first client render matches the server HTML).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = JSON.parse(localStorage.getItem(MOOD_KEY) || "[]");
        if (Array.isArray(v)) setSaved(v);
      } catch {
        /* ignore */
      }
      try {
        const k = localStorage.getItem(OWN_KEY_STORAGE);
        if (k) setOwnKey(k);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MOOD_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const runSearch = useCallback(
    async (
      m: TrackerMode,
      q: string,
      offset: number,
      refresh: boolean,
      s: TrackerSort,
      t: TrackerType,
      a: TrackerAi
    ) => {
      const value = String(q || "").trim();
      if (!value) {
        showToast(m === "contributor" ? "Enter a creator ID." : "Enter a keyword.", "error");
        return;
      }
      const first = offset === 0;
      if (first) {
        setLoading(true);
        setError("");
      } else {
        setLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          mode: m,
          limit: String(pageSize),
          offset: String(offset),
          sort: s,
          type: t,
          ai: a,
        });
        if (refresh) params.set("refresh", "true");
        if (m === "contributor") params.set("creatorId", value);
        else params.set("q", value);
        const headers: Record<string, string> = {};
        if (ownKey) headers["x-tracker-key"] = ownKey;
        const res = await fetch(`/api/adobe-tracker?${params.toString()}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const err: TrackerApiError = {
            message: data.message || `Tracker request failed (${res.status}).`,
            code: data.code || "",
            byoRequired: !!data.byoRequired,
          };
          throw err;
        }
        setAssets((prev) => (first ? data.assets || [] : [...prev, ...(data.assets || [])]));
        setTotal(Number(data.total) || 0);
        setResp({
          cached: !!data.cached,
          provider: data.provider || "",
          approximate: !!data.approximate,
          updatedAt: data.updatedAt || 0,
          stats: data.stats || null,
          quota: data.quota || null,
          byo: !!data.byo,
          hasMore: !!data.hasMore,
          totalExact: !!data.totalExact,
        });
        setQuery(value);
        if (refresh) showToast("Fresh data loaded.");
        if (data.byo) showToast("Searching with your own API key.");
      } catch (e) {
        const err = e as TrackerApiError;
        if (first) {
          if (settings.byoEnabled && (err.byoRequired || err.code === "quota-exhausted")) {
            setShowByo(true);
          }
          setError(err.message || "Tracker request failed.");
          setAssets([]);
        } else {
          showToast(err.message || "Could not load more.", "error");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [ownKey, pageSize, settings.byoEnabled, showToast]
  );

  // Deep-link compat: ?mode=&q= / ?creator=
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const t = setTimeout(() => {
      try {
        const p = new URLSearchParams(window.location.search);
        const m = p.get("mode");
        const q = p.get("q") || p.get("creator") || "";
        if (q) {
          if (m === "contributor") setMode("contributor");
          setInput(q);
          void runSearch(m === "contributor" ? "contributor" : "search", q, 0, false, "downloads", "all", "all");
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [runSearch]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void runSearch(mode, input, 0, false, sort, type, ai);
    },
    [mode, input, sort, type, ai, runSearch]
  );

  const handleRefresh = useCallback(() => {
    if (query) void runSearch(mode, query, 0, true, sort, type, ai);
  }, [mode, query, sort, type, ai, runSearch]);

  const handleLoadMore = useCallback(() => {
    if (query) void runSearch(mode, query, assets.length, false, sort, type, ai);
  }, [mode, query, assets.length, sort, type, ai, runSearch]);

  const handleModeChange = useCallback((m: TrackerMode) => {
    // Tab isolation: one section's results never show in the other.
    setMode(m);
    setInput("");
    setQuery("");
    setAssets([]);
    setTotal(0);
    setResp(EMPTY_RESP);
    setError("");
  }, []);

  const refetchWith = useCallback(
    (patch: { sort?: TrackerSort; type?: TrackerType; ai?: TrackerAi }) => {
      const s = patch.sort !== undefined ? patch.sort : sort;
      const t = patch.type !== undefined ? patch.type : type;
      const a = patch.ai !== undefined ? patch.ai : ai;
      if (patch.sort !== undefined) setSort(patch.sort);
      if (patch.type !== undefined) setType(patch.type);
      if (patch.ai !== undefined) setAi(patch.ai);
      if (query) void runSearch(mode, query, 0, false, s, t, a);
    },
    [sort, type, ai, query, mode, runSearch]
  );

  const toggleSave = useCallback(
    (asset: TrackerAsset) => {
      setSaved((prev) => {
        if (prev.some((s) => String(s.id) === String(asset.id))) {
          showToast("Removed from moodboard.");
          return prev.filter((s) => String(s.id) !== String(asset.id));
        }
        showToast("Saved to moodboard.");
        return [...prev, asset];
      });
    },
    [showToast]
  );

  const isSaved = useCallback((id: string) => saved.some((s) => String(s.id) === String(id)), [saved]);

  const loadApiStatus = useCallback(async () => {
    setApiStatusLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (ownKey) headers["x-tracker-key"] = ownKey;
      const res = await fetch("/api/adobe-tracker?action=status", { headers });
      const data = await res.json().catch(() => ({}));
      setApiStatus(data.status || EMPTY_STATUS);
    } catch (e) {
      setApiStatus({ connected: false, error: e instanceof Error ? e.message : "Status check failed." });
    } finally {
      setApiStatusLoading(false);
    }
  }, [ownKey]);

  const openApiPanel = useCallback(() => {
    setShowApi(true);
    if (ownKey) void loadApiStatus();
    else setApiStatus(EMPTY_STATUS);
  }, [ownKey, loadApiStatus]);

  const handleByoSave = useCallback(() => {
    const key = byoKey.trim();
    if (!key) {
      showToast("Paste your API key first.", "error");
      return;
    }
    try {
      localStorage.setItem(OWN_KEY_STORAGE, key);
    } catch {
      /* ignore */
    }
    setOwnKey(key);
    setByoKey("");
    setShowByo(false);
    setShowApi(false);
    showToast("API key saved. Retrying search…");
    const q = (query || input || "").trim();
    if (q) void runSearch(mode, q, 0, false, sort, type, ai);
    void loadApiStatus();
  }, [byoKey, query, input, mode, sort, type, ai, runSearch, loadApiStatus, showToast]);

  const handleByoRemove = useCallback(() => {
    try {
      localStorage.removeItem(OWN_KEY_STORAGE);
    } catch {
      /* ignore */
    }
    setOwnKey("");
    setApiStatus(EMPTY_STATUS);
    showToast("API key removed.");
  }, [showToast]);

  const handleKeywordClick = useCallback(
    (kw: string) => {
      setMode("search");
      setInput(kw);
      void runSearch("search", kw, 0, false, sort, type, ai);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [sort, type, ai, runSearch]
  );

  const handleCreatorClick = useCallback(
    (asset: TrackerAsset) => {
      if (!asset.creatorId) {
        showToast("No creator ID on this asset.", "error");
        return;
      }
      setMode("contributor");
      setInput(String(asset.creatorId));
      void runSearch("contributor", String(asset.creatorId), 0, false, sort, type, ai);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [sort, type, ai, runSearch, showToast]
  );

  const exportCSV = useCallback(() => {
    const head = "id,title,creator,creator_id,downloads,views,category,type,width,height,upload_date,ai,keywords,url";
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = assets.map((a) =>
      [
        a.id, a.title, a.creator, a.creatorId, a.downloads ?? "", a.views ?? "",
        a.category, a.mediaType || "", a.width ?? "", a.height ?? "", a.creationDate || "",
        a.isAI ? "yes" : "no", (a.keywords || []).join(" | "), a.detailsUrl,
      ]
        .map(esc)
        .join(",")
    );
    downloadFile(`adobe-tracker-${query || "results"}-${Date.now()}.csv`, [head, ...rows].join("\n"), "text/csv");
    showToast("CSV downloaded.");
  }, [assets, query, showToast]);

  const exportTXT = useCallback(() => {
    downloadFile(
      `adobe-tracker-${query || "results"}-${Date.now()}.txt`,
      assets.map((a) => a.title).join("\n"),
      "text/plain"
    );
    showToast("Titles downloaded.");
  }, [assets, query, showToast]);

  const hasMore = !!query && !loading && resp.hasMore;
  const totalExact = resp.totalExact;
  const totalAssets = resp.stats?.totalAssets ?? total;
  const aiTotal = resp.stats ? resp.stats.aiCount ?? 0 : assets.filter((a) => a.isAI).length;
  const nonAiTotal = resp.stats ? resp.stats.nonAiCount ?? 0 : assets.length - aiTotal;
  const apiPanelVisible = settings.apiPanelEnabled;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <Link
        href="/tools"
        className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
      >
        <I d={ICONS.arrowLeft} className="h-3.5 w-3.5" /> All tools
      </Link>

      <header className="mb-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <I d={ICONS.trending} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">Adobe Tracker</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Search any keyword or track any contributor — real per-asset download counts, views,
            categories and keywords.
          </p>
        </div>
      </header>

      {/* Search panel */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {([
              { id: "search" as TrackerMode, label: "Search by Keyword" },
              { id: "contributor" as TrackerMode, label: "Search by Contributor ID" },
            ]).map((t) => {
              const disabled = t.id === "contributor" && !settings.contributorEnabled;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (!disabled) handleModeChange(t.id);
                  }}
                  disabled={disabled}
                  title={disabled ? "Contributor search is not available." : undefined}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                    mode === t.id
                      ? "bg-brand text-white shadow"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {settings.byoEnabled && apiPanelVisible && (
            <button
              onClick={openApiPanel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition-all hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
            >
              <I d={ICONS.key} className={`h-3.5 w-3.5 ${ownKey ? "text-emerald-500" : ""}`} />
              API
              {ownKey && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </button>
          )}
          <button
            onClick={() => setShowSaved(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition-all hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
          >
            <I
              d={ICONS.heart}
              className={`h-3.5 w-3.5 ${saved.length ? "fill-emerald-500 text-emerald-500" : ""}`}
            />
            Moodboards
            {saved.length > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {saved.length}
              </span>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <I d={ICONS.search} className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "contributor"
                  ? "Creator ID (numeric) or creator name…"
                  : "Search for vectors, photos, illustrations…"
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-40 sm:flex-none"
            >
              <I d={ICONS.search} className="h-3.5 w-3.5" />
              {loading ? "Analyzing…" : "Analyze"}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExport((v) => !v)}
                disabled={!assets.length}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-all hover:border-brand hover:text-brand disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                <I d={ICONS.download} className="h-3.5 w-3.5" /> Download
                <I d={ICONS.chevron} className="h-3 w-3" />
              </button>
              {showExport && (
                <>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setShowExport(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-surface py-1 shadow-xl dark:border-slate-700">
                    <button
                      onClick={() => {
                        exportCSV();
                        setShowExport(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Results (.csv)
                    </button>
                    <button
                      onClick={() => {
                        exportTXT();
                        setShowExport(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Titles (.txt)
                    </button>
                  </div>
                </>
              )}
            </div>
            {query && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-all hover:border-brand hover:text-brand disabled:opacity-40 dark:border-slate-700"
                title="Refresh (bypass cache)"
              >
                <I d={ICONS.refresh} className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </form>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <LabeledSelect
            label="Sort by"
            value={sort}
            onChange={(v) => refetchWith({ sort: v as TrackerSort })}
            options={TRACKER_SORTS}
          />
          <LabeledSelect
            label="Content type"
            value={type}
            onChange={(v) => refetchWith({ type: v as TrackerType })}
            options={TRACKER_TYPES}
          />
          <LabeledSelect
            label="Generative AI"
            value={ai}
            onChange={(v) => refetchWith({ ai: v as TrackerAi })}
            options={TRACKER_AI_FILTERS}
          />
        </div>
      </div>

      {/* Quota chips */}
      {resp.updatedAt > 0 && !loading && (resp.quota || resp.byo || ownKey) && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
          {resp.quota && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {resp.quota.unlimited ? "Unlimited" : `${resp.quota.remaining}/${resp.quota.limit} left`}
            </span>
          )}
          {(resp.byo || ownKey) && (
            <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              <I d={ICONS.key} className="h-2.5 w-2.5" /> Own key
            </span>
          )}
          {resp.provider && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {resp.provider === "mock" ? "demo data" : resp.provider}
              {resp.cached ? " · cached" : ""}
            </span>
          )}
        </p>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-surface py-10 text-sm text-slate-500 dark:border-slate-800">
          {SPINNER} Searching Adobe Stock…
        </div>
      )}
      {!loading && error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results header */}
      {!loading && !error && query && assets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">
            Results for &ldquo;{query}&rdquo;
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
              {formatCount(totalAssets)}
              {totalExact ? "" : "+"} Assets Found
            </span>
            <span className="rounded-full border border-emerald-500 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {formatCount(nonAiTotal)}
              {totalExact ? "" : "+"} Non-AI
            </span>
            {aiTotal > 0 && (
              <span className="rounded-full border border-purple-500 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                {formatCount(aiTotal)}
                {totalExact ? "" : "+"} AI
              </span>
            )}
          </div>
        </div>
      )}

      {/* Contributor profile + totals */}
      {mode === "contributor" && !loading && !error && query && assets.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-surface p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-bold text-white">
              {(assets[0]?.creator || "C").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{assets[0]?.creator || "Contributor"}</p>
              <p className="text-[11px] text-slate-400">
                Creator ID: {query}
                {resp.stats?.exact === false ? " · approximate" : ""}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800">
              <p className="text-base font-bold">{formatCount(totalAssets)}</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total files</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800">
              <p className="text-base font-bold text-purple-600 dark:text-purple-400">{formatCount(aiTotal)}</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">AI files</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center dark:bg-emerald-900/25">
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatCount(resp.stats?.totalDownloads ?? 0)}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total downloads</p>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {assets.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {assets.map((a) => {
              const age = ageFromDate(a.creationDate);
              return (
                <div
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-surface transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg dark:border-slate-800"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {a.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.thumbnail}
                        alt={a.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                      {a.mediaType && (
                        <span className="rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-bold capitalize text-white backdrop-blur-sm">
                          {a.mediaType === "photo" ? "Photo/Image" : a.mediaType}
                        </span>
                      )}
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold text-white ${
                          a.isAI ? "bg-purple-600" : "bg-emerald-500"
                        }`}
                      >
                        {a.isAI ? "AI" : "Non-AI"}
                      </span>
                    </div>
                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSave(a);
                        }}
                        className={`rounded-full p-1.5 backdrop-blur-sm transition-all ${
                          isSaved(a.id)
                            ? "bg-emerald-500 text-white"
                            : "bg-black/45 text-white hover:bg-black/65"
                        }`}
                        title={isSaved(a.id) ? "Remove from moodboard" : "Save to moodboard"}
                      >
                        <I
                          d={ICONS.bookmark}
                          className={`h-3 w-3 ${isSaved(a.id) ? "fill-white" : ""}`}
                        />
                      </button>
                      {(a.downloads ?? 0) > 0 && (
                        <span className="flex items-center gap-1 rounded-lg bg-emerald-600/90 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
                          <I d={ICONS.download} className="h-2.5 w-2.5" />
                          {formatCount(a.downloads)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyText(a.title, "Prompt", showToast);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-brand dark:bg-white dark:text-slate-900"
                      >
                        <I d={ICONS.sparkles} className="h-2.5 w-2.5" /> Prompt
                      </button>
                      {age && <span className="whitespace-nowrap text-[10px] text-slate-400">{age}</span>}
                    </div>
                    <p className="line-clamp-2 min-h-[2.2rem] text-[13px] font-semibold leading-snug">
                      {a.title}
                    </p>
                    {a.creator && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatorClick(a);
                        }}
                        className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-brand dark:text-slate-400"
                      >
                        <I d={ICONS.user} className="h-3 w-3 shrink-0" />
                        <span className="truncate">{a.creator}</span>
                        <I d={ICONS.external} className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {a.category && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <I d={ICONS.folder} className="h-3 w-3" />
                        {a.category}
                      </p>
                    )}
                    {a.keywords?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {a.keywords.slice(0, 8).map((k) => (
                          <button
                            key={k}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKeywordClick(k);
                            }}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300"
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-2 dark:bg-emerald-900/25">
                        <I d={ICONS.download} className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold leading-none">
                            {formatCount(a.downloads)}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">
                            Downloads
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl bg-teal-50 px-2.5 py-2 dark:bg-teal-900/20">
                        <I d={ICONS.calendar} className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold leading-none">
                            {formatDate(a.creationDate)}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-teal-600/70 dark:text-teal-400/70">
                            Upload date
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <a
                        href={a.detailsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 transition-colors hover:text-brand dark:text-slate-400"
                      >
                        <I d={ICONS.external} className="h-2.5 w-2.5" /> Open in Stock
                      </a>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyText(a.title, "Title", showToast);
                          }}
                          className="rounded-md px-1.5 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-emerald-50 hover:text-brand dark:hover:bg-emerald-900/20"
                          title="Copy title"
                        >
                          T
                        </button>
                        {a.keywords?.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyText(a.keywords.join(", "), "Keywords", showToast);
                            }}
                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-brand dark:hover:bg-emerald-900/20"
                            title="Copy keywords"
                          >
                            <I d={ICONS.copy} className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all hover:border-brand hover:text-brand disabled:opacity-40 dark:border-slate-700"
              >
                {loadingMore ? "Loading…" : <>Load more <I d={ICONS.chevron} className="h-3 w-3" /></>}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && !error && query && assets.length === 0 && (
        <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
          No assets found. Try another keyword or creator ID.
        </div>
      )}
      {!loading && !error && !query && (
        <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
          <I d={ICONS.trending} className="mx-auto mb-3 h-7 w-7 text-emerald-500" />
          Search a keyword to see what actually sells — or track a contributor portfolio by creator ID.
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl dark:border-slate-700">
            <button
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <I d={ICONS.x} className="h-4 w-4" />
            </button>
            <h3 className="mb-3 pr-8 text-base font-bold">{selected.title}</h3>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                {selected.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.thumbnail} alt={selected.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="space-y-2 text-sm">
                <StatRow icon={ICONS.download} label="Downloads" value={formatCount(selected.downloads)} />
                <StatRow icon={ICONS.calendar} label="Upload date" value={formatDate(selected.creationDate)} />
                <StatRow icon={ICONS.user} label="Creator" value={selected.creator || "—"} />
                <StatRow icon={ICONS.folder} label="Category" value={selected.category || "—"} />
                <StatRow
                  icon={ICONS.ruler}
                  label="Dimensions"
                  value={
                    selected.width && selected.height ? `${selected.width} × ${selected.height}` : "—"
                  }
                />
                <StatRow icon={ICONS.sparkles} label="Generative AI" value={selected.isAI ? "Yes" : "No"} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={selected.detailsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition-all hover:opacity-90"
                  >
                    View on Adobe Stock <I d={ICONS.external} className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => void copyText(selected.title, "Title", showToast)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all hover:border-brand hover:text-brand dark:border-slate-700"
                  >
                    <I d={ICONS.copy} className="h-3 w-3" /> Title
                  </button>
                  {selected.keywords?.length > 0 && (
                    <button
                      onClick={() => void copyText(selected.keywords.join(", "), "Keywords", showToast)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all hover:border-brand hover:text-brand dark:border-slate-700"
                    >
                      <I d={ICONS.copy} className="h-3 w-3" /> Keywords
                    </button>
                  )}
                </div>
              </div>
            </div>
            {selected.keywords?.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  <I d={ICONS.tag} className="h-2.5 w-2.5" /> Keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.keywords.map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        setSelected(null);
                        handleKeywordClick(k);
                      }}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BYO API key modal */}
      {showByo && settings.byoEnabled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowByo(false)} />
          <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl dark:border-slate-700">
            <div className="mb-2 flex items-center gap-2">
              <I d={ICONS.key} className="h-4 w-4 shrink-0 text-brand" />
              <h3 className="text-base font-bold">{settings.byoTitle}</h3>
              <button
                onClick={() => setShowByo(false)}
                className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <I d={ICONS.x} className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {settings.byoMessage}
            </p>
            <div className="mt-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                How to get your key
              </p>
              <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {settings.byoGuide}
              </p>
              {settings.byoGuideUrl && (
                <a
                  href={settings.byoGuideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
                >
                  Open provider dashboard <I d={ICONS.external} className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={byoKey}
                onChange={(e) => setByoKey(e.target.value)}
                placeholder="Paste your API key…"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                onClick={handleByoSave}
                disabled={!byoKey.trim()}
                className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API manager panel */}
      {showApi && settings.byoEnabled && apiPanelVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowApi(false)} />
          <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl dark:border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <I d={ICONS.key} className="h-4 w-4 shrink-0 text-brand" />
              <h3 className="text-base font-bold">Tracker API</h3>
              <button
                onClick={() => setShowApi(false)}
                className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <I d={ICONS.x} className="h-4 w-4" />
              </button>
            </div>
            {ownKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Own API key connected
                  </p>
                  <button
                    onClick={handleByoRemove}
                    className="ml-auto text-[11px] font-bold text-red-500 hover:text-red-600 disabled:opacity-40"
                  >
                    Remove

                  </button>
                </div>
                {apiStatusLoading ? (
                  <p className="py-4 text-center text-xs text-slate-400">Checking key status…</p>
                ) : apiStatus && apiStatus.connected ? (
                  <div className="space-y-2.5 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Account</span>
                      <span className="font-bold">
                        {apiStatus.username || "—"}
                        {apiStatus.planTier
                          ? ` · ${apiStatus.planTier}`
                          : apiStatus.planId
                            ? ` · ${apiStatus.planId}`
                            : ""}
                      </span>
                    </div>
                    {apiStatus.usage && apiStatus.usage.maxUsd != null && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">Monthly usage</span>
                          <span className="font-bold">
                            ${Number(apiStatus.usage.usedUsd || 0).toFixed(2)} / $
                            {Number(apiStatus.usage.maxUsd).toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                            style={{
                              width: `${Math.min(
                                100,
                                (Number(apiStatus.usage.usedUsd || 0) /
                                  Math.max(0.01, Number(apiStatus.usage.maxUsd))) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Spent this cycle</span>
                      <span className="font-bold">${Number(apiStatus.spend?.totalUsd || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Compute units</span>
                      <span className="font-bold">
                        {formatCount(Math.round(Number(apiStatus.usage?.computeUnits || 0)))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-500 dark:border-red-900/40 dark:bg-red-900/20">
                    {apiStatus?.error || "Key is invalid or expired. Replace it below."}
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={byoKey}
                    onChange={(e) => setByoKey(e.target.value)}
                    placeholder="Replace with a new key…"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                  <button
                    onClick={handleByoSave}
                    disabled={!byoKey.trim()}
                    className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  No API key added. Searches run on the shared site quota
                  {resp.quota && !resp.quota.unlimited
                    ? ` (${resp.quota.remaining}/${resp.quota.limit} left today)`
                    : ""}
                  . Add your own key for personal quota and usage insights.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={byoKey}
                    onChange={(e) => setByoKey(e.target.value)}
                    placeholder="Paste your API key…"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                  <button
                    onClick={handleByoSave}
                    disabled={!byoKey.trim()}
                    className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
                {settings.byoGuideUrl && (
                  <a
                    href={settings.byoGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
                  >
                    Where do I get a key? <I d={ICONS.external} className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            )}
            <div className="mt-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tutorial — get your API key
              </p>
              <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {settings.byoGuide}
              </p>
              <a
                href={settings.byoGuideUrl || "https://console.apify.com/settings/integrations"}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
              >
                Get your API key — console.apify.com/settings/integrations{" "}
                <I d={ICONS.external} className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Moodboards modal */}
      {showSaved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSaved(false)} />
          <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl dark:border-slate-700">
            <div className="mb-4 flex items-center gap-2">
              <I d={ICONS.heart} className="h-4 w-4 fill-emerald-500 text-emerald-500" />
              <h3 className="text-base font-bold">Moodboards ({saved.length})</h3>
              <button
                onClick={() => setShowSaved(false)}
                className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <I d={ICONS.x} className="h-4 w-4" />
              </button>
            </div>
            {saved.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Nothing saved yet. Tap the bookmark icon on any asset to build your moodboard.
              </p>
            ) : (
              <div className="space-y-1.5">
                {saved.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2 dark:border-slate-800"
                  >
                    {a.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbnail} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{a.title}</p>
                      <p className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-0.5">
                          <I d={ICONS.download} className="h-2.5 w-2.5" /> {formatCount(a.downloads)}
                        </span>
                        {a.creator && <span className="truncate">{a.creator}</span>}
                      </p>
                    </div>
                    <a
                      href={a.detailsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:text-brand"
                      title="Open in Stock"
                    >
                      <I d={ICONS.external} className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => toggleSave(a)}
                      className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title="Remove"
                    >
                      <I d={ICONS.x} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ToolToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
