import communityJson from "../community.json";

export interface CommunityPost {
  id: string;
  date: string;
  pinned: boolean;
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
}

/**
 * Community feed - maintained exclusively in the official repository
 * (community.json) and distributed to every fork via auto-sync.
 * Not editable from any Admin Panel or database.
 */
export const COMMUNITY_POSTS: CommunityPost[] = (() => {
  try {
    const raw = (communityJson as { posts?: unknown }).posts;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p) => ({
        id: String(p?.id ?? ""),
        date: String(p?.date ?? ""),
        pinned: Boolean(p?.pinned),
        title: String(p?.title ?? "").trim(),
        body: String(p?.body ?? "").trim(),
        linkUrl: typeof p?.linkUrl === "string" && p.linkUrl ? p.linkUrl : undefined,
        linkLabel: typeof p?.linkLabel === "string" && p.linkLabel ? p.linkLabel : undefined,
      }))
      .filter((p) => p.id && p.title)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.date.localeCompare(a.date);
      });
  } catch {
    return [];
  }
})();
