import type { GeneratedMetadata } from "@/lib/types";
import { resolveProvider, type ResolvedProvider } from "@/lib/ai/providers";
import type { PromptOptions } from "@/lib/ai/prompts";
import {
  AI_CATEGORY_ID,
  AI_DISCLOSURE,
  endsWithAIDisclosure,
  toCategoryIds,
  toCategoryNames,
} from "@/lib/csv/dreamstimeRules";

// Per-call timeout: tight enough that a hung provider rotates quickly,
// loose enough for large images (CSV Tree uses 22s in-browser; we can afford
// a little more because the serverless budget is 300s).
const REQUEST_TIMEOUT_MS = 30_000;

// Transient-error retries with exponential backoff (CSV Tree withRetry).
// Rate-limits are NOT retried inline - the client rotates keys/providers.
const RETRY_DELAYS = [300, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined;
  const msg = String(e?.message || "").toLowerCase();
  if (e?.name === "AbortError") return true;
  return /timeout|aborted|network|fetch|econn|temporarily|overloaded|5\d\d/.test(msg);
}

export interface GenerateInput {
  imageBase64: string; // raw base64, no data: prefix
  mimeType: string;
  prompt: string;
}

/** Text (or optional-image) call used by the tools' AI passes. */
export interface TextInput {
  prompt: string;
  imageBase64?: string; // raw base64, no data: prefix
  mimeType?: string;
}

export interface TextCallOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Single dispatch point for every provider kind. Image parts are optional,
 * so text-only instructions (prompt generator tools) share this path.
 * Wrapped in withRetry: transient errors (network, 5xx, timeouts) get an
 * exponential-backoff retry before the client rotates to the next key.
 */
export async function callAiProvider(
  provider: ResolvedProvider,
  input: TextInput,
  opts: TextCallOptions = {}
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      if (provider.def.kind === "gemini") return await callGemini(provider, input, opts);
      if (provider.def.kind === "cloudflare") return await callCloudflare(provider, input, opts);
      return await callOpenAICompatible(provider, input, opts);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === RETRY_DELAYS.length) throw err;
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw lastErr;
}

export interface GenerateOutcome {
  metadata: GeneratedMetadata | null; // metadata mode
  promptText: string | null; // img2prompt mode
  provider: string;
  model: string;
  durationMs: number;
}

/**
 * Calls a vision LLM using either visitor-supplied credentials
 * ({provider, apiKey}) or the server env fallback.
 */
export async function generateWithAi(
  input: GenerateInput,
  options: PromptOptions,
  override?: { provider?: string; apiKey?: string }
): Promise<GenerateOutcome> {
  const started = Date.now();
  const resolved = resolveProvider(override);
  if (!resolved) {
    throw new Error(
      override?.apiKey
        ? `Unknown provider "${override.provider}".`
        : "No API key available. Add keys in API Keys or set AI_PROVIDER/AI_API_KEY on the server."
    );
  }

  const rawText = await callAiProvider(resolved, input, {
    jsonMode: options.mode !== "img2prompt",
  });

  if (options.mode === "img2prompt") {
    let p = extractImg2PromptText(rawText);
    p = enforcePrompt(p, options);

    // The LLM frequently undershoots the requested minimum on the first
    // pass. Re-prompt the same provider once asking it to expand, then
    // keep whichever attempt is closer to the range. Overshoot alone never
    // retries - it is already truncated to max in enforcePrompt.
    if (p.length < options.promptLengthMin) {
      try {
        const retryText = await callAiProvider(resolved, {
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          prompt: buildExtendPrompt(p, options.promptLengthMin, options.promptLengthMax),
        });
        const extended = enforcePrompt(extractImg2PromptText(retryText), options);
        if (extended.length > p.length) p = extended;
      } catch {
        // Best-effort - keep the original short result.
      }
    }

    return {
      metadata: null,
      promptText: p,
      provider: resolved.def.id,
      model: resolved.model,
      durationMs: Date.now() - started,
    };
  }

  const parsed = parseJsonResponse(rawText);
  let metadata = enforceMetadata(parsed, options);

  // Title undershoot retry: vision LLMs habitually return 40-70 char
  // titles and ignore the STRICT instruction. Feed the short title back
  // asking for a longer rewrite, then re-enforce so banned-words /
  // affixes / max-truncation stay consistent. Best-effort.
  if (metadata.title.length < options.titleLengthMin) {
    try {
      const retryText = await callAiProvider(resolved, {
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        prompt: buildTitleExtendPrompt(
          metadata.title,
          options.titleLengthMin,
          options.titleLengthMax,
          options.negativeTitleWords
        ),
      }, { jsonMode: false });
      const extended = extractTitleText(retryText);
      if (extended && extended.length > metadata.title.length) {
        metadata = enforceMetadata({ ...metadata, title: extended }, options);
      }
    } catch {
      // Keep the original short title.
    }
  }

  // Keyword undershoot retry: ask for ONLY the deficit with the existing
  // list visible so it doesn't repeat, then merge + re-enforce (dedupe,
  // banned filter, max slice). Best-effort.
  if (metadata.keywords.length < options.keywordsCountMin) {
    try {
      const retryText = await callAiProvider(resolved, {
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        prompt: buildKeywordsExtendPrompt(
          metadata.keywords,
          options.keywordsCountMin,
          options.keywordsCountMax,
          options.negativeKeywords
        ),
      }, { jsonMode: true });
      const extra = parseKeywordExtension(retryText);
      if (extra.length) {
        metadata = enforceMetadata(
          { ...metadata, keywords: [...metadata.keywords, ...extra] },
          options
        );
      }
    } catch {
      // Keep the original short list.
    }
  }

  return {
    metadata,
    promptText: null,
    provider: resolved.def.id,
    model: resolved.model,
    durationMs: Date.now() - started,
  };
}

/* ---------------------------------------------------------------------- */
/* Undershoot extension re-prompts - port of CSV Tree's build*ExtendPrompt */
/* ---------------------------------------------------------------------- */

/**
 * img2prompt: feed the short prompt back with the exact deficit so the
 * model extends with concrete detail instead of fluff.
 */
function buildExtendPrompt(currentText: string, min: number, max: number): string {
  const have = (currentText || "").length;
  const deficit = Math.max(0, min - have);
  const target = Math.round((min + max) / 2);
  return `Below is a text-to-image prompt that is too short. Extend it so it is at least ${min} characters and at most ${max} characters long. Aim for around ${target} characters total. Add concrete sensory details — texture, palette, lens, light direction, mood, foreground/background — rather than padding with filler or repeating phrases. Keep the original subject and style intact.\n\nCurrent prompt (${have} chars, ${deficit} short of the minimum):\n${currentText}\n\nOUTPUT RULES:\n- Return ONLY the extended prompt as plain text, no markdown, no JSON, no quotes.\n- Do NOT prepend "Extended:" or any other label.\n- Do NOT use code fences.`;
}

/** Metadata: rewrite a title that undershot the configured minimum. */
function buildTitleExtendPrompt(
  currentTitle: string,
  tMin: number,
  tMax: number,
  negativeTitleWords: string
): string {
  const have = (currentTitle || "").length;
  const deficit = Math.max(0, tMin - have);
  const target = Math.round((tMin + tMax) / 2);
  let p = `The microstock title below is too short. Rewrite it so the new title is at least ${tMin} characters and at most ${tMax} characters long. Aim for around ${target} characters. Keep the same subject as the current title and stay accurate to the image — add concrete descriptors (material, colour, mood, setting, style, composition) instead of padding with filler or repeating words.\n\nCurrent title (${have} chars, ${deficit} short of the minimum):\n${currentTitle}\n\nOUTPUT RULES:\n- Return ONLY the new title as plain text, no quotes, no markdown, no JSON.\n- Do NOT prepend "Title:" or any other label.\n- Do NOT use code fences.\n- Keep it SEO-friendly, no filler words like "amazing", "stunning", "beautiful" unless visually justified.`;
  if (negativeTitleWords) p += `\n- Do NOT include any of these words: ${negativeTitleWords}`;
  return p;
}

/** Metadata: request only the missing keywords, then merge deduped. */
function buildKeywordsExtendPrompt(
  existingKeywords: string[],
  kMin: number,
  kMax: number,
  negativeKeywords: string
): string {
  const have = existingKeywords.length;
  const need = Math.max(0, kMin - have);
  const ask = Math.min(kMax - have, Math.max(need, Math.round((kMin + kMax) / 2) - have));
  const list = existingKeywords.map((k) => `- ${k}`).join("\n");
  let p = `The image already has these ${have} keywords:\n${list}\n\nReturn ${ask} ADDITIONAL keywords for the same image. Total should land between ${kMin} and ${kMax}.\n\nRULES:\n- Do NOT repeat any keyword already listed above (case-insensitive).\n- Keep keywords short (1-3 words each), descriptive, and relevant to the subject, style, mood, composition or lighting.\n- Return ONLY a JSON array of strings, no markdown, no prose, no code fences.\nExample format: ["keyword one", "keyword two", "keyword three"]`;
  if (negativeKeywords) p += `\n- Do NOT include any of these: ${negativeKeywords}`;
  return p;
}

/**
 * Strip whatever wrapping a vision LLM puts around a single-line title
 * reply (quotes, "Title:" prefix, fences, JSON). Never throws.
 */
function extractTitleText(raw: string): string {
  if (!raw) return "";
  let text = String(raw).trim();
  const fence = text.match(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1].trim();
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as { title?: unknown };
      if (typeof obj.title === "string" && obj.title.trim()) return obj.title.trim();
    } catch {
      const m = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return m[1].trim();
    }
  }
  const firstLine =
    text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "";
  return firstLine
    .replace(/^["'`*]+|["'`*]+$/g, "")
    .replace(/^(?:title|new title|rewritten title)\s*[:-]\s*/i, "")
    .trim();
}

/** Parse the "more keywords" retry response (JSON array, tolerant). */
function parseKeywordExtension(raw: string): string[] {
  if (!raw) return [];
  let text = String(raw).trim();
  const fence = text.match(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1].trim();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
      } catch {}
    }
  }
  // Last resort: split on commas / newlines, strip bullets and quotes.
  return text
    .split(/[\n,]+/)
    .map((s) => s.replace(/^[\s\-*•"'']+|["'\s]+$/g, "").trim())
    .filter(Boolean);
}

/* ---------------------------------------------------------------------- */
/* Provider calls                                                          */
/* ---------------------------------------------------------------------- */

async function callOpenAICompatible(
  provider: ResolvedProvider,
  input: TextInput,
  opts: TextCallOptions = {}
): Promise<string> {
  const content: unknown[] = [{ type: "text", text: input.prompt }];
  if (input.imageBase64 && input.mimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content }],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${truncate(body, 300)}`);
    }
    const json = await res.json();
    return normalizeContent(json?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

async function callCloudflare(
  provider: ResolvedProvider,
  input: TextInput,
  opts: TextCallOptions = {}
): Promise<string> {
  // Key format: ACCOUNT_ID:API_TOKEN
  const sep = provider.apiKey.indexOf(":");
  if (sep <= 0) throw new Error("Cloudflare key must be ACCOUNT_ID:API_TOKEN.");
  const accountId = provider.apiKey.slice(0, sep);
  const token = provider.apiKey.slice(sep + 1);
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${encodeURIComponent(provider.model)}`;

  const content: unknown[] = [{ type: "text", text: input.prompt }];
  if (input.imageBase64 && input.mimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${truncate(body, 300)}`);
    }
    const json = await res.json();
    return normalizeContent(json?.result?.response ?? json?.result?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/** CSV Tree's lite→full Gemini cascade (used when the preferred model fails). */
const GEMINI_MODEL_CASCADE = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

async function callGemini(
  provider: ResolvedProvider,
  input: TextInput,
  opts: TextCallOptions = {}
): Promise<string> {
  const jsonMode = opts.jsonMode === true;
  const models = [
    provider.model,
    ...GEMINI_MODEL_CASCADE.filter((m) => m !== provider.model),
  ];
  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await callGeminiModel(provider, input, model, jsonMode, true, opts);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      // Quota/429 = key-level problem: stop and let the client rotate keys
      // instead of burning the remaining models on a dead key.
      if (/\(429\)|quota/i.test(msg)) throw lastError;
      // Otherwise (model missing, 400s) try the next model in the cascade.
    }
  }
  throw lastError ?? new Error("Gemini request failed.");
}

async function callGeminiModel(
  provider: ResolvedProvider,
  input: TextInput,
  model: string,
  jsonMode: boolean,
  allowNoJsonMime = true,
  opts: TextCallOptions = {}
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const requestParts: unknown[] = [{ text: input.prompt }];
  if (input.imageBase64 && input.mimeType) {
    requestParts.push({ inline_data: { mime_type: input.mimeType, data: input.imageBase64 } });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxTokens ?? (jsonMode ? 2048 : 4096),
          // Forces clean JSON out of Gemini for metadata mode.
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Some models reject responseMimeType - retry once without it.
      if (res.status === 400 && jsonMode && allowNoJsonMime && /responseMimeType|response_mime_type/i.test(body)) {
        clearTimeout(timer);
        return callGeminiModel(provider, input, model, jsonMode, false, opts);
      }
      throw new Error(`AI request failed (${res.status}): ${truncate(body, 300)}`);
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
  } finally {
    clearTimeout(timer);
  }
}

/** Some providers return content as an array of parts instead of a string. */
function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""
      )
      .join("");
  }
  if (content && typeof content === "object") {
    const c = content as { text?: unknown; content?: unknown };
    if (typeof c.text === "string") return c.text;
    if (typeof c.content === "string") return c.content;
  }
  return "";
}

/* ---------------------------------------------------------------------- */
/* Response parsing                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Vision LLMs love wrapping JSON in code fences / prose even when told not
 * to. Salvage the first balanced JSON object found in the text.
 */
export function parseJsonResponse(raw: string): Partial<GeneratedMetadata> {
  let text = String(raw || "").trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("Could not parse the AI response as JSON. Please try again.");
}

/**
 * Port of CSV Tree's extractImg2PromptText: vision models often ignore
 * "plain text only" and emit JSON or fenced text. Salvage the prompt.
 */
export function extractImg2PromptText(raw: string): string {
  if (!raw) return "";
  let text = String(raw).trim();

  const fence = text.match(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1].trim();

  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text);
      const candidate =
        (typeof obj.prompt === "string" && obj.prompt) ||
        (typeof obj.text === "string" && obj.text) ||
        (typeof obj.description === "string" && obj.description) ||
        (typeof obj.image_prompt === "string" && obj.image_prompt) ||
        "";
      if (candidate) return candidate.trim();
    } catch {
      const m = text.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) {
        try {
          return JSON.parse(`"${m[1]}"`);
        } catch {
          return m[1];
        }
      }
    }
  }
  return text;
}

/* ---------------------------------------------------------------------- */
/* Enforcement - port of CSV Tree's enforceUserSettings                    */
/* ---------------------------------------------------------------------- */

function stripBannedWords(text: string, csv: string): string {
  if (!csv || !text) return text;
  const words = csv.split(",").map((w) => w.trim()).filter(Boolean);
  if (!words.length) return text;
  let out = String(text);
  for (const w of words) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function filterBannedKeywords(keywords: string[], csv: string): string[] {
  if (!Array.isArray(keywords) || !csv) return keywords;
  const banned = new Set(
    csv.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
  );
  if (!banned.size) return keywords;
  return keywords.filter((k) => !banned.has(k.trim().toLowerCase()));
}

function applyAffix(text: string, prefix: string, suffix: string): string {
  let out = String(text || "").trim();
  if (prefix && !out.toLowerCase().startsWith(prefix.toLowerCase())) {
    const sep = /\s$/.test(prefix) ? "" : " ";
    out = `${prefix}${sep}${out}`;
  }
  if (suffix && !out.toLowerCase().endsWith(suffix.toLowerCase())) {
    const sep = /^\s/.test(suffix) ? "" : " ";
    out = `${out}${sep}${suffix}`;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function truncateWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
}

export function enforceMetadata(
  meta: Partial<GeneratedMetadata>,
  o: PromptOptions
): GeneratedMetadata {
  // Title: banned words -> affixes -> word-boundary truncation to max.
  let title = typeof meta.title === "string" ? meta.title.trim() : "";
  title = stripBannedWords(title, o.negativeTitleWords);
  title = applyAffix(title, o.prefix, o.suffix);
  title = truncateWordBoundary(title, o.titleLengthMax);

  // Description: prohibited words -> user prefix/suffix -> platform char
  // budget. Dreamstime AI uploads must close with the disclosure sentence,
  // so room for it is reserved BEFORE the final truncation - otherwise the
  // mandatory sentence would be the first thing cut off.
  let description = typeof meta.description === "string" ? meta.description.trim() : "";
  description = stripBannedWords(description, o.prohibitedWords);
  description = applyAffix(description, o.descPrefix, o.descSuffix);

  const charMode = o.descriptionUnit === "chars";
  const dMax = charMode ? o.descriptionCharMax : 2000;
  let finalDescription =
    description.length > dMax ? truncateWordBoundary(description, dMax) : description;
  if (o.platform === "dreamstime" && o.isAIGenerated && !endsWithAIDisclosure(finalDescription)) {
    const tail = ` ${AI_DISCLOSURE}`;
    finalDescription = `${truncateWordBoundary(finalDescription, Math.max(0, dMax - tail.length))}${tail}`.trim();
  }

  // Keywords: banned -> trim/dedupe (case-insensitive) -> cap at max.
  const seen = new Set<string>();
  let keywords = Array.isArray(meta.keywords) ? meta.keywords.map(String) : [];
  keywords = filterBannedKeywords(keywords, o.negativeKeywords);
  keywords = keywords
    .map((k) => k.trim().replace(/\s+/g, " "))
    .filter((k) => k.length > 0 && k.length <= 60)
    .filter((k) => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(o.keywordsCountMax, o.keywordsCountMin));

  // Category snap to admin list when possible.
  let category = typeof meta.category === "string" ? meta.category.trim() : "";
  if (category && o.includeCategory && o.categories.length > 0) {
    category = o.categories.find((c) => c.toLowerCase() === category.toLowerCase()) || category;
  }

  // Freepik extras.
  let freepikPrompt: string | undefined;
  let baseModel: string | undefined;
  if (o.platform === "freepik") {
    freepikPrompt = truncateWordBoundary(
      stripBannedWords(typeof meta.prompt === "string" ? meta.prompt.trim() : "", o.prohibitedWords),
      250
    );
    baseModel = typeof meta.baseModel === "string" && meta.baseModel.trim() ? meta.baseModel.trim() : "leonardo";
  }

  // Dreamstime categories: normalise whatever came back to canonical names
  // (max 3), forcing the AI category when the visitor flagged the batch.
  let categories: string[] | undefined;
  if (o.platform === "dreamstime") {
    let catIds = toCategoryIds(meta.categories);
    if (o.isAIGenerated && !catIds.includes(AI_CATEGORY_ID)) {
      catIds = [AI_CATEGORY_ID, ...catIds];
    }
    const names = toCategoryNames(catIds).slice(0, 3);
    if (names.length) categories = names;
  }

  return {
    title,
    description: finalDescription,
    keywords,
    category: category || undefined,
    categories,
    prompt: freepikPrompt,
    baseModel,
  };
}

export function enforcePrompt(promptText: string, o: PromptOptions): string {
  let p = stripBannedWords(promptText, o.negativePromptWords);
  p = applyAffix(p, o.prefix, o.suffix);
  p = truncateWordBoundary(p, o.promptLengthMax);
  return p;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
