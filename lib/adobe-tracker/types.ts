/**
 * Shared Adobe Tracker types + defaults.
 * One UI-facing asset shape no matter the provider (server-normalized).
 */

export interface TrackerAsset {
  id: string;
  title: string;
  creator: string;
  creatorId: string;
  thumbnail: string;
  downloads: number | null;
  views: number | null;
  category: string;
  /** mock/apify only - the official Adobe API does not return it. */
  mediaType?: string;
  width: number | null;
  height: number | null;
  creationDate: string;
  isAI: boolean;
  keywords: string[];
  detailsUrl: string;
}

export interface TrackerStats {
  totalAssets: number;
  totalDownloads: number;
  avgDownloads: number;
  aiCount: number;
  nonAiCount: number;
  exact: boolean;
}

export interface TrackerSearchResult {
  assets: TrackerAsset[];
  total: number;
  approximate: boolean;
  stats: TrackerStats | null;
  hasMore: boolean;
  totalExact: boolean;
}

export interface TrackerQuota {
  limit: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
}

export interface TrackerSettings {
  enabled: boolean;
  /** Shared daily searches (-1 = unlimited). */
  dailySearches: number;
  /** Server-side cap on results returned per search (1..50). */
  resultsPerSearch: number;
  contributorEnabled: boolean;
  /** Whose key serves searches: site pool first, own key only, site only. */
  apiSource: "auto" | "admin" | "user";
  /** Allow the in-tool "add your own Apify key" flow. */
  byoEnabled: boolean;
  apiPanelEnabled: boolean;
  byoTitle: string;
  byoMessage: string;
  byoGuide: string;
  byoGuideUrl: string;
}

export const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  enabled: true,
  dailySearches: -1,
  resultsPerSearch: 20,
  contributorEnabled: true,
  apiSource: "auto",
  byoEnabled: true,
  apiPanelEnabled: true,
  byoTitle: "Daily limit reached",
  byoMessage:
    "You have used all free searches for today. Add your own Apify API key to keep researching with your own quota — it stays private to your browser.",
  byoGuide:
    "1. Go to console.apify.com and create a free account.\n2. Open Settings → Integrations and copy your Personal API token (free $5 credits every month).\n3. Paste the token below and save. Your key never leaves your browser and is used solely for your tracker searches.",
  byoGuideUrl: "https://console.apify.com/settings/integrations",
};

export const TRACKER_TYPES = [
  { id: "all", label: "All Asset Types" },
  { id: "photo", label: "Photos" },
  { id: "vector", label: "Vectors" },
  { id: "illustration", label: "Illustrations" },
  { id: "video", label: "Videos" },
] as const;

export const TRACKER_SORTS = [
  { id: "downloads", label: "Most Downloads" },
  { id: "relevance", label: "Relevance" },
  { id: "newest", label: "Newest" },
] as const;

export const TRACKER_AI_FILTERS = [
  { id: "all", label: "All Content (Include AI)" },
  { id: "exclude", label: "Exclude AI" },
  { id: "only", label: "AI Only" },
] as const;

export type TrackerMode = "search" | "contributor";
export type TrackerSort = "downloads" | "relevance" | "newest";
export type TrackerType = "all" | "photo" | "vector" | "illustration" | "video";
export type TrackerAi = "all" | "exclude" | "only";
