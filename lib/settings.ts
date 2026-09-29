import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_PROVIDER_IDS,
  DEFAULT_GENERATOR_SETTINGS,
  DEFAULT_SITE_SETTINGS,
  type GeneratorSettings,
  type SiteSettings,
} from "@/lib/types";

/**
 * Performance notes:
 * - The raw row reads are wrapped in unstable_cache (60s + a tag) so a
 *   page navigation costs ZERO database queries once warm.
 * - Admin save routes call revalidateTag(SITE_SETTINGS_TAG, "max") after
 *   writing, so changes appear on the next request (stale-while-revalidate).
 * - The exported getters are wrapped in React cache(), so the root
 *   layout, header and footer share ONE read per request instead of
 *   each hitting the (possibly stale) cache separately.
 */

export const SITE_SETTINGS_TAG = "site-settings";
export const GENERATOR_SETTINGS_TAG = "generator-settings";

interface SiteRow {
  site_name?: string;
  site_description?: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  footer_text?: string;
  primary_color?: string;
  secondary_color?: string;
  theme_mode?: string;
  hero_badge?: string;
  hero_title?: string;
  hero_subtitle?: string;
  about_title?: string;
  about_body?: string;
  features?: unknown;
  steps?: unknown;
  enabled_providers?: unknown;
}

interface GeneratorRow {
  title_length_min?: number;
  title_length_max?: number;
  description_words_min?: number;
  description_words_max?: number;
  keywords_count_min?: number;
  keywords_count_max?: number;
  include_category?: boolean;
  categories?: unknown;
  language?: string;
  custom_prompt?: string;
  max_images_per_batch?: number;
  rate_limit_per_hour?: number;
}

const readSiteRow = unstable_cache(
  async (): Promise<SiteRow | null> => {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return (data as SiteRow | null) ?? null;
    } catch {
      return null;
    }
  },
  ["site-settings-row"],
  { revalidate: 60, tags: [SITE_SETTINGS_TAG] }
);

const readGeneratorRow = unstable_cache(
  async (): Promise<GeneratorRow | null> => {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("generator_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return (data as GeneratorRow | null) ?? null;
    } catch {
      return null;
    }
  },
  ["generator-settings-row"],
  { revalidate: 60, tags: [GENERATOR_SETTINGS_TAG] }
);

/**
 * Load site settings with hard defaults as a fallback so the site still
 * renders even before Supabase is configured (first-run DX).
 */
export const getSiteSettings = cache((): Promise<SiteSettings> => {
  const d = DEFAULT_SITE_SETTINGS;
  return readSiteRow().then((data) => {
    if (!data) return d;
    return {
      site_name: data.site_name || d.site_name,
      site_description: data.site_description || d.site_description,
      logo_url: data.logo_url ?? null,
      favicon_url: data.favicon_url ?? null,
      footer_text: data.footer_text || d.footer_text,
      primary_color: data.primary_color || d.primary_color,
      secondary_color: data.secondary_color || d.secondary_color,
      theme_mode: (["light", "dark", "system"].includes(data.theme_mode || "")
        ? data.theme_mode
        : "system") as SiteSettings["theme_mode"],
      hero_badge: data.hero_badge || d.hero_badge,
      hero_title: data.hero_title || d.hero_title,
      hero_subtitle: data.hero_subtitle || d.hero_subtitle,
      about_title: data.about_title || d.about_title,
      about_body: data.about_body || d.about_body,
      features: parseBlocks(data.features, d.features),
      steps: parseBlocks(data.steps, d.steps),
      enabled_providers: parseProviders(data.enabled_providers),
    };
  });
});

function parseProviders(value: unknown): string[] {
  if (!Array.isArray(value)) return [...ALL_PROVIDER_IDS];
  const ids = value.map(String).filter((id) => ALL_PROVIDER_IDS.includes(id));
  return ids.length > 0 ? ids : [...ALL_PROVIDER_IDS];
}

function parseBlocks(value: unknown, fallback: { title: string; body: string }[]) {
  if (!Array.isArray(value)) return fallback;
  const blocks = value
    .map((b) => ({
      title: typeof b?.title === "string" ? b.title.trim() : "",
      body: typeof b?.body === "string" ? b.body.trim() : "",
    }))
    .filter((b) => b.title || b.body);
  return blocks.length > 0 ? blocks : fallback;
}

export const getGeneratorSettings = cache((): Promise<GeneratorSettings> => {
  const fallback = DEFAULT_GENERATOR_SETTINGS;
  return readGeneratorRow().then((data) => {
    if (!data) return fallback;
    return {
      title_length_min: clampInt(data.title_length_min, 10, 300, fallback.title_length_min),
      title_length_max: clampInt(data.title_length_max, 20, 300, fallback.title_length_max),
      description_words_min: clampInt(data.description_words_min, 5, 200, fallback.description_words_min),
      description_words_max: clampInt(data.description_words_max, 10, 300, fallback.description_words_max),
      keywords_count_min: clampInt(data.keywords_count_min, 3, 100, fallback.keywords_count_min),
      keywords_count_max: clampInt(data.keywords_count_max, 5, 100, fallback.keywords_count_max),
      include_category: typeof data.include_category === "boolean" ? data.include_category : true,
      categories: Array.isArray(data.categories) && data.categories.length
        ? data.categories.map(String)
        : fallback.categories,
      language: data.language || fallback.language,
      custom_prompt: data.custom_prompt || "",
      max_images_per_batch: clampInt(data.max_images_per_batch, 1, 200, fallback.max_images_per_batch),
      rate_limit_per_hour: clampInt(data.rate_limit_per_hour, 0, 100000, fallback.rate_limit_per_hour),
    };
  });
});

function clampInt(value: unknown, min: number, max: number, dflt: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}
