import announcementJson from "../announcement.json";

export interface Announcement {
  enabled: boolean;
  id: string;
  theme: "info" | "promo" | "warning";
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
}

/**
 * Developer-controlled marketing banner. Lives in the official repo and
 * reaches every fork through the daily auto-sync - it cannot be edited
 * from any Admin Panel.
 */
export const ANNOUNCEMENT: Announcement | null = (() => {
  try {
    const raw = announcementJson as Partial<Announcement> & { $schema?: string };
    if (!raw || raw.enabled !== true || !raw.id || !raw.title) return null;
    return {
      enabled: true,
      id: String(raw.id),
      theme: (["info", "promo", "warning"].includes(String(raw.theme))
        ? raw.theme
        : "info") as Announcement["theme"],
      title: String(raw.title),
      body: String(raw.body ?? ""),
      linkUrl: typeof raw.linkUrl === "string" && raw.linkUrl ? raw.linkUrl : undefined,
      linkLabel: typeof raw.linkLabel === "string" ? raw.linkLabel : undefined,
    };
  } catch {
    return null;
  }
})();
