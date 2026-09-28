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

const REQUEST_TIMEOUT_MS = 90_000;

export interface GenerateInput {
  imageBase64: string; // raw base64, no data: prefix
  mimeType: string;
  prompt: string;
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

  let rawText = "";
  if (resolved.def.kind === "gemini")
    rawText = await callGemini(resolved, input, options.mode !== "img2prompt");
  else if (resolved.def.kind === "cloudflare") rawText = await callCloudflare(resolved, input);
  else rawText = await callOpenAICompatible(resolved, input);

  const durationMs = Date.now() - started;

  if (options.mode === "img2prompt") {
    let p = extractImg2PromptText(rawText);
    p = enforcePrompt(p, options);
    return { metadata: null, promptText: p, provider: resolved.def.id, model: resolved.model, durationMs };
  }

  const parsed = parseJsonResponse(rawText);
  const metadata = enforceMetadata(parsed, options);
  return { metadata, promptText: null, provider: resolved.def.id, model: resolved.model, durationMs };
}

/* ---------------------------------------------------------------------- */
/* Provider calls                                                          */
/* ---------------------------------------------------------------------- */

async function callOpenAICompatible(provider: ResolvedProvider, input: GenerateInput): Promise<string> {
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
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              {
                type: "image_url",
                image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
              },
            ],
          },
        ],
        temperature: 0.4,
        max_tokens: 1024,
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

async function callCloudflare(provider: ResolvedProvider, input: GenerateInput): Promise<string> {
  // Key format: ACCOUNT_ID:API_TOKEN
  const sep = provider.apiKey.indexOf(":");
  if (sep <= 0) throw new Error("Cloudflare key must be ACCOUNT_ID:API_TOKEN.");
  const accountId = provider.apiKey.slice(0, sep);
  const token = provider.apiKey.slice(sep + 1);
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${encodeURIComponent(provider.model)}`;

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
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              {
                type: "image_url",
                image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 1024,
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
  input: GenerateInput,
  jsonMode: boolean
): Promise<string> {
  const models = [
    provider.model,
    ...GEMINI_MODEL_CASCADE.filter((m) => m !== provider.model),
  ];
  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await callGeminiModel(provider, input, model, jsonMode);
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
  input: GenerateInput,
  model: string,
  jsonMode: boolean,
  allowNoJsonMime = true
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input.prompt },
              { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: jsonMode ? 2048 : 4096,
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
        return callGeminiModel(provider, input, model, jsonMode, false);
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

  // Description.
  let description = typeof meta.description === "string" ? meta.description.trim() : "";
  description = stripBannedWords(description, o.prohibitedWords);

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

  // Dreamstime AI disclosure must be the closing sentence - reserve room for
  // it BEFORE the final truncation so it can never be the part cut off.
  let finalDescription = truncateWordBoundary(description, 2000);
  if (o.platform === "dreamstime" && o.isAIGenerated && !endsWithAIDisclosure(finalDescription)) {
    const tail = ` ${AI_DISCLOSURE}`;
    finalDescription = `${truncateWordBoundary(description, Math.max(0, 2000 - tail.length))}${tail}`.trim();
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
