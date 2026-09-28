import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools/registry";

const BASE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/generator`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/updates`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/community`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  const toolPages: MetadataRoute.Sitemap = TOOLS.filter((t) => t.status === "live").map((t) => ({
    url: `${BASE}${t.href}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...pages, ...toolPages];
}
