import type { TrackerMode, TrackerSearchResult, TrackerAi, TrackerSort, TrackerType } from "./types";

/**
 * Deterministic sample provider (default) - zero config, so the tool UI
 * works end-to-end before any keys exist. Ported 1:1 from CSV Tree.
 */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_CREATORS: Array<[string, string]> = [
  ["PixelBloom", "204004289"],
  ["VectorVault", "200407313"],
  ["LensCraft", "205216144"],
  ["StockForge", "205271089"],
  ["ArtNova", "206118730"],
];
const MOCK_CATS = ["Nature", "Business", "People", "Technology", "Food", "Travel"];
const MOCK_KW = [
  "sunset", "business", "nature", "portrait", "city",
  "food", "travel", "abstract", "fitness", "family",
];

export function mockSearch(
  mode: TrackerMode,
  query: string,
  limit: number,
  offset: number,
  opts: { sort?: TrackerSort; type?: TrackerType; ai?: TrackerAi } = {}
): TrackerSearchResult {
  const { sort = "downloads", type = "all", ai = "all" } = opts;
  const seed = hashStr(`${mode}:${query}`);
  const words = String(query || "stock")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const base = words.length
    ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
    : "Stock";
  const TYPES = ["photo", "photo", "photo", "vector", "illustration", "video"] as const;
  const total = 240;
  // Full-set generation is cheap - powers exact contributor stats.
  const all = [];
  for (let i = 0; i < total; i++) {
    const r = mulberry32(seed + i * 7919);
    const [creator, creatorId] = MOCK_CREATORS[Math.floor(r() * MOCK_CREATORS.length)];
    const downloads = Math.floor(40 + Math.pow(r(), 2.2) * 5200);
    const mediaType = TYPES[Math.floor(r() * TYPES.length)];
    all.push({
      id: String(300000000 + (seed % 50000000) + i),
      title: `${base} ${
        ["photo", "landscape", "concept", "background", "illustration"][Math.floor(r() * 5)]
      } #${i + 1}`,
      creator,
      creatorId,
      thumbnail: `https://picsum.photos/seed/adb-${seed}-${i}/400/300`,
      downloads,
      views: downloads * (6 + Math.floor(r() * 14)),
      category: MOCK_CATS[Math.floor(r() * MOCK_CATS.length)],
      mediaType,
      width: 6000,
      height: 4000,
      creationDate: `202${2 + Math.floor(r() * 4)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`,
      isAI: r() < 0.15,
      keywords: [
        ...words.map((w) => w.toLowerCase()),
        ...MOCK_KW.filter(() => r() < 0.3),
      ].slice(0, 12),
      detailsUrl: "https://stock.adobe.com/",
    });
  }
  let pool = type === "all" ? all : all.filter((a) => a.mediaType === type);
  if (ai === "exclude") pool = pool.filter((a) => !a.isAI);
  else if (ai === "only") pool = pool.filter((a) => a.isAI);
  if (sort === "newest") {
    pool = [...pool].sort((a, b) => String(b.creationDate).localeCompare(String(a.creationDate)));
  } else if (sort === "relevance") {
    pool = [...pool].sort((a, b) => Number(a.id) - Number(b.id));
  } else {
    pool = [...pool].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  }
  const assets = pool.slice(offset, offset + limit);
  const sum = pool.reduce((s, a) => s + (a.downloads || 0), 0);
  const aiTotal = pool.filter((a) => a.isAI).length;
  return {
    assets,
    total: pool.length,
    approximate: mode === "search",
    stats: {
      totalAssets: pool.length,
      totalDownloads: sum,
      avgDownloads: pool.length ? Math.round(sum / pool.length) : 0,
      aiCount: aiTotal,
      nonAiCount: pool.length - aiTotal,
      exact: mode === "contributor",
    },
    hasMore: offset + limit < pool.length,
    totalExact: true,
  };
}
