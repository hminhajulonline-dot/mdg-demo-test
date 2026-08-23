import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeneratorSettings, getSiteSettings } from "@/lib/settings";
import { buildPrompt, type PromptOptions } from "@/lib/ai/prompts";
import { generateWithAi } from "@/lib/ai/generate";
import { hashIp, rateLimit } from "@/lib/rateLimit";
import { assertLicenseIntegrity } from "@/lib/core/license";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);
const MAX_BASE64_LENGTH = 10 * 1024 * 1024; // ~7.5 MB decoded

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/* ------------------------------------------------------------------ */
/* Option sanitising - visitors may override controls within hard      */
/* limits; everything else comes from admin generator_settings.        */
/* ------------------------------------------------------------------ */

function clampNum(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function clampBool(v: unknown): boolean {
  return v === true;
}

function buildOptions(body: Record<string, unknown>, s: Awaited<ReturnType<typeof getGeneratorSettings>>): PromptOptions {
  const u = (body.options ?? {}) as Record<string, unknown>;

  const titleMin = clampNum(u.titleLengthMin, 10, 300) ?? s.title_length_min;
  const titleMaxRaw = clampNum(u.titleLengthMax, 20, 300) ?? s.title_length_max;
  const titleMax = Math.max(titleMaxRaw, titleMin + 5);

  const kwMin = clampNum(u.keywordsCountMin, 3, 100) ?? s.keywords_count_min;
  const kwMax = Math.max(clampNum(u.keywordsCountMax, 5, 100) ?? s.keywords_count_max, kwMin);

  const pMin = clampNum(u.promptLengthMin, 50, 3000) ?? 300;
  const pMax = Math.max(clampNum(u.promptLengthMax, 100, 4000) ?? 700, pMin + 50);

  const mode =
    u.mode === "img2prompt" || body.mode === "img2prompt" ? "img2prompt" : "metadata";

  const vectorKind = typeof body.vectorKind === "string" ? body.vectorKind.trim() : "";
  const vector = ["svg", "postscript"].includes(vectorKind) ? vectorKind : null;

  return {
    mode: mode as PromptOptions["mode"],
    vector,
    platform: typeof body.platform === "string" && /^[a-z0-9-]{1,30}$/.test(body.platform)
      ? body.platform
      : "general",
    // metadata
    titleLengthMin: titleMin,
    titleLengthMax: titleMax,
    descriptionWordsMin: s.description_words_min,
    descriptionWordsMax: s.description_words_max,
    keywordsCountMin: kwMin,
    keywordsCountMax: kwMax,
    includeCategory: s.include_category,
    categories: s.categories,
    language: s.language,
    singleWordKw: clampBool(u.singleWordKw),
    silhouette: clampBool(u.silhouette),
    transparent: clampBool(u.transparent),
    // PNGs are recompressed to JPEG in the browser; the client tells us the
    // original type so transparent-background phrasing still applies.
    isPng: body.pngSource === true || body.mimeType === "image/png",
    prefix: clampStr(u.prefix, 60),
    suffix: clampStr(u.suffix, 60),
    negativeTitleWords: clampStr(u.negativeTitleWords, 300),
    negativeKeywords: clampStr(u.negativeKeywords, 300),
    prohibitedWords: clampStr(u.prohibitedWords, 300),
    customPrompt: clampStr(
      typeof u.customPrompt === "string" && u.customPrompt.trim()
        ? `${s.custom_prompt ? s.custom_prompt + "\n" : ""}${u.customPrompt}`
        : s.custom_prompt,
      2000
    ),
    // img2prompt
    promptLengthMin: pMin,
    promptLengthMax: pMax,
    whiteBackground: clampBool(u.whiteBackground),
    cameraParameters: clampBool(u.cameraParameters),
    negativePromptWords: clampStr(u.negativePromptWords, 300),
  };
}

export async function POST(request: Request) {
  // Core integrity check - generation refuses to run when the required
  // Plickify attribution has been tampered with.
  assertLicenseIntegrity();

  // The whole site is admin-only: generation requires an active admin.
  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, WebP, GIF or BMP." },
      { status: 400 }
    );
  }
  let imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!imageBase64) {
    return NextResponse.json({ error: "Missing image data." }, { status: 400 });
  }
  if (imageBase64.includes(",")) imageBase64 = imageBase64.slice(imageBase64.indexOf(",") + 1);
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "Image too large. Please upload an image under 7 MB." },
      { status: 413 }
    );
  }

  const settings = await getGeneratorSettings();
  const options = buildOptions(body, settings);

  // Optional visitor-supplied credentials (BYOK). The provider must be
  // admin-enabled and known; otherwise the server env key is used.
  const requestedProvider =
    typeof body.provider === "string" ? body.provider.slice(0, 40).trim() : "";
  const providedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  let override: { provider: string; apiKey: string } | undefined;
  if (requestedProvider && providedKey) {
    const site = await getSiteSettings();
    if (!site.enabled_providers.includes(requestedProvider)) {
      return NextResponse.json(
        { error: `Provider "${requestedProvider}" is not enabled by the admin.` },
        { status: 400 }
      );
    }
    override = { provider: requestedProvider, apiKey: providedKey.slice(0, 600) };
  }

  // Rate limit BEFORE calling the AI provider. 0 = unlimited.
  if (settings.rate_limit_per_hour > 0) {
    const rl = rateLimit(hashIp(clientIp(request)), settings.rate_limit_per_hour);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached (${settings.rate_limit_per_hour} generations/hour). Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
  }

  const prompt = buildPrompt(options);

  try {
    const outcome = await generateWithAi(
      { imageBase64, mimeType, prompt },
      options,
      override
    );

    logUsage({
      ipHash: hashIp(clientIp(request)),
      filename: typeof body.filename === "string" ? body.filename.slice(0, 200) : undefined,
      success: true,
      provider: outcome.provider,
      model: outcome.model,
      durationMs: outcome.durationMs,
      titleLength: outcome.metadata?.title.length ?? outcome.promptText?.length ?? null,
      keywordCount: outcome.metadata?.keywords.length ?? null,
    });

    if (options.mode === "img2prompt") {
      return NextResponse.json({ prompt: outcome.promptText });
    }
    return NextResponse.json({ metadata: outcome.metadata });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Generation failed unexpectedly.";
    logUsage({
      ipHash: hashIp(clientIp(request)),
      filename: typeof body.filename === "string" ? body.filename.slice(0, 200) : undefined,
      success: false,
      errorMessage: message.slice(0, 500),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Fire-and-forget usage logging - never blocks or breaks generation. */
function logUsage(entry: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    admin.from("usage_logs").insert({ ...entry }).then(undefined, () => {});
  } catch {
    // Service role not configured yet (first run) - ignore.
  }
}
