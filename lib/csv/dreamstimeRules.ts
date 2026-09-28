/**
 * Dreamstime-specific contributor rules for the metadata generator.
 * TypeScript port of CSV Tree's dreamstimeRules.js.
 *
 * Source of truth: Dreamstime contributor guidelines + the rules supplied by
 * the product owner. The generator exports the category alongside the 4 CSV
 * columns so it doubles as a flow aid on the upload form.
 *
 * Thresholds are deliberately two-tier: `error` is reserved for numbers we're
 * confident are hard submit limits, `warn` covers stricter "recommended"
 * figures. Every threshold lives in DREAMSTIME_LIMITS below.
 */

export interface DreamstimeCategory {
  id: number;
  name: string;
}

export const DREAMSTIME_CATEGORIES: DreamstimeCategory[] = [
  { id: 38, name: "Abstract" },
  { id: 29, name: "Animals" },
  { id: 69, name: "Arts & Architecture" },
  { id: 74, name: "Business" },
  { id: 177, name: "Editorial" },
  { id: 188, name: "Holidays" },
  { id: 108, name: "IT & C" },
  { id: 172, name: "Illustrations & Clipart" },
  { id: 86, name: "Industries" },
  { id: 8, name: "Nature" },
  { id: 133, name: "Objects" },
  { id: 114, name: "People" },
  { id: 103, name: "Technology" },
  { id: 55, name: "Travel" },
  { id: 197, name: "Web Design Graphics" },
];

export const AI_CATEGORY_ID = 172;

/** Dreamstime requires an AI-generated asset to declare itself. */
export const AI_DISCLOSURE = "This is AI-generated.";

export function endsWithAIDisclosure(text: string): boolean {
  return /this\s+is\s+ai[\s-]?generated\s*\.?\s*$/i.test(String(text || "").trim());
}

export const DREAMSTIME_LIMITS = {
  titleMin: 5,
  titleMax: 130,
  descMin: 50,
  descMax: 250,
  kwMin: 7,
  kwRecommendedMin: 10,
  kwMax: 80,
  kwHardCap: 80,
  maxCategories: 3,
  titleDescOverlapWarn: 0.8,
};

// Words too common to count as evidence that a description is specific.
const STOP_WORDS = new Set([
  "a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "with", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "this", "that",
  "these", "those", "it", "its", "or", "but", "not", "no", "up", "out",
  "over", "under", "into", "onto", "about", "above", "below", "near",
  "image", "photo", "picture", "background", "view", "shot", "close",
]);

function contentWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Map a mixed array of category ids, numeric strings or category names to
 * canonical numeric ids. Unknown entries are dropped. Used so validation and
 * CSV export both work whether the categories came from the AI response
 * (names) or elsewhere (ids).
 */
export function toCategoryIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  value.forEach((entry: unknown) => {
    if (entry == null) return;
    const asNum = Number(entry);
    if (Number.isFinite(asNum) && DREAMSTIME_CATEGORIES.some((c) => c.id === asNum)) {
      if (!out.includes(asNum)) out.push(asNum);
      return;
    }
    const name = String(entry).trim().toLowerCase();
    if (!name) return;
    const match =
      DREAMSTIME_CATEGORIES.find((c) => c.name.toLowerCase() === name) ||
      // Tolerate the AI returning a partial name, e.g. "AI generated".
      DREAMSTIME_CATEGORIES.find((c) => c.name.toLowerCase().includes(name));
    if (match && !out.includes(match.id)) out.push(match.id);
  });
  return out;
}

/** Same input as toCategoryIds, but returns display names for the CSV. */
export function toCategoryNames(value: unknown): string[] {
  return toCategoryIds(value)
    .map((id) => DREAMSTIME_CATEGORIES.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
}

export interface DreamstimeCheck {
  level: "error" | "warn";
  msg: string;
}

/**
 * Validate generated metadata against Dreamstime's contributor rules.
 */
export function validateDreamstime(
  meta: { title?: string; description?: string; keywords?: string[] },
  opts: { categories?: unknown; isAIGenerated?: boolean } = {}
): DreamstimeCheck[] {
  const out: DreamstimeCheck[] = [];
  const title = String(meta?.title || "").trim();
  const desc = String(meta?.description || "").trim();
  const kws = Array.isArray(meta?.keywords)
    ? meta.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const cats = toCategoryIds(opts.categories);
  const isAI = !!opts.isAIGenerated;

  if (title.length < DREAMSTIME_LIMITS.titleMin) {
    out.push({ level: "error", msg: `Title is ${title.length} chars — Dreamstime requires at least ${DREAMSTIME_LIMITS.titleMin}.` });
  }
  if (title.length > DREAMSTIME_LIMITS.titleMax) {
    out.push({ level: "error", msg: `Title is ${title.length} chars — Dreamstime max is ${DREAMSTIME_LIMITS.titleMax}.` });
  }

  if (!desc) {
    out.push({ level: "error", msg: "Description is empty — Dreamstime requires a description." });
  } else {
    if (desc.length > DREAMSTIME_LIMITS.descMax) {
      out.push({ level: "warn", msg: `Description is ${desc.length} chars — Dreamstime recommends ≤ ${DREAMSTIME_LIMITS.descMax}.` });
    }
    if (desc.length < DREAMSTIME_LIMITS.descMin) {
      out.push({ level: "warn", msg: `Description is short (${desc.length} chars). Add detail — Dreamstime rejects generic info.` });
    }
  }

  if (title && desc) {
    if (title.toLowerCase() === desc.toLowerCase()) {
      out.push({ level: "warn", msg: "Title and description are identical — the description should expand on the title." });
    } else {
      const titleWordSet = new Set(contentWords(title));
      const descWordSet = new Set(contentWords(desc));
      const smaller = Math.min(titleWordSet.size, descWordSet.size);
      if (smaller >= 3) {
        let shared = 0;
        titleWordSet.forEach((w) => {
          if (descWordSet.has(w)) shared++;
        });
        const overlap = shared / smaller;
        if (overlap >= DREAMSTIME_LIMITS.titleDescOverlapWarn) {
          out.push({
            level: "warn",
            msg: `Description repeats ${Math.round(overlap * 100)}% of the title's words — Dreamstime rejects a description that is too similar to the title. Add new detail instead of rephrasing.`,
          });
        }
      }
    }
  }

  if (desc && desc.length >= DREAMSTIME_LIMITS.descMin) {
    const words = desc.split(/\s+/).filter(Boolean);
    const hasProperNoun = words.slice(1).some((w) => /^[A-Z][a-z]{2,}/.test(w));
    const hasNumber = /\d/.test(desc);
    if (words.length < 18 && !hasProperNoun && !hasNumber) {
      out.push({
        level: "warn",
        msg: "Description looks generic — name the location, landmark, or flora/fauna species, and say what makes this image stand out.",
      });
    }
  }

  const titleWords = title.split(/\s+/).filter(Boolean);
  const descWords = desc.split(/\s+/).filter(Boolean);
  const allCaps = (words: string[]) =>
    words.length > 0 && words.every((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  if (allCaps(titleWords)) out.push({ level: "warn", msg: "Title is ALL CAPS — avoid capital letters (CAPS LOCK)." });
  if (allCaps(descWords)) out.push({ level: "warn", msg: "Description is ALL CAPS — avoid capital letters (CAPS LOCK)." });

  if (kws.length < DREAMSTIME_LIMITS.kwMin) {
    out.push({ level: "error", msg: `Only ${kws.length} keywords — Dreamstime requires at least ${DREAMSTIME_LIMITS.kwMin}.` });
  } else if (kws.length < DREAMSTIME_LIMITS.kwRecommendedMin) {
    out.push({ level: "warn", msg: `${kws.length} keywords will upload, but ${DREAMSTIME_LIMITS.kwRecommendedMin}+ is recommended for search ranking.` });
  }
  if (kws.length > DREAMSTIME_LIMITS.kwHardCap) {
    out.push({ level: "warn", msg: `Dreamstime's hard keyword cap is ${DREAMSTIME_LIMITS.kwHardCap}; ${kws.length} may be truncated on upload.` });
  }
  if (kws.length > DREAMSTIME_LIMITS.kwMax) {
    out.push({ level: "warn", msg: `Keywords exceed the ${DREAMSTIME_LIMITS.kwMax} you configured.` });
  }
  const stems = new Set<string>();
  kws.forEach((k) => {
    const s = k.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
    if (s) stems.add(s);
  });
  if (kws.length > 4 && stems.size < kws.length * 0.6) {
    out.push({ level: "warn", msg: "Many keywords look like repeats of the same word (spam) — keep them distinct." });
  }

  if (cats.length > DREAMSTIME_LIMITS.maxCategories) {
    out.push({ level: "error", msg: `${cats.length} categories selected — Dreamstime accepts at most ${DREAMSTIME_LIMITS.maxCategories}.` });
  }

  if (isAI) {
    if (!endsWithAIDisclosure(desc)) {
      out.push({ level: "error", msg: `AI-generated image: the description must end with "${AI_DISCLOSURE}".` });
    }
    if (!cats.includes(AI_CATEGORY_ID)) {
      out.push({ level: "error", msg: 'AI-generated image: must include the "Illustrations & Clipart / AI generated" category.' });
    }
  }

  const mrMention = /\bmodel release\b|\bmr\b|released for publication/i.test(`${title} ${desc}`);
  const personMention = /\bperson\b|\bpeople\b|\bman\b|\bwoman\b|\bchild\b|\bface\b|portrait|model\b/i.test(`${title} ${desc}`);
  if (mrMention && !personMention) {
    out.push({ level: "warn", msg: "Mentions a model release but no person detected — only mark MR when the image has recognizable people." });
  }

  const nonAscii = Array.from(`${title} ${desc}`).filter((ch) => ch.charCodeAt(0) > 127).length;
  if (nonAscii > 8) {
    out.push({ level: "warn", msg: "Title/description has significant non-English text — Dreamstime requires English." });
  }

  return out;
}
