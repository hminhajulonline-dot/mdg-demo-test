import { NextResponse } from "next/server";
import { requireAdminOrReturn } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeneratorSettings, getSiteSettings } from "@/lib/settings";
import { resolveProvider } from "@/lib/ai/providers";
import { callAiProvider } from "@/lib/ai/generate";
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
const MAX_BASE64_LENGTH = 6 * 1024 * 1024; // ~4.5 MB decoded
const MAX_INSTRUCTION = 30_000;

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function clampNum(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Generic text/vision AI endpoint used by the tools (prompt generator AI
 * passes, reference-image analysis, IP audits). BYOK via {provider, apiKey},
 * otherwise the server env key - same contract as /api/generate.
 */
export async function POST(request: Request) {
  assertLicenseIntegrity();

  const guard = await requireAdminOrReturn();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "Missing instruction." }, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION) {
    return NextResponse.json(
      { error: `Instruction too long (max ${MAX_INSTRUCTION} characters).` },
      { status: 413 }
    );
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (typeof body.imageBase64 === "string" && body.imageBase64) {
    imageBase64 = body.imageBase64.includes(",")
      ? body.imageBase64.slice(body.imageBase64.indexOf(",") + 1)
      : body.imageBase64;
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Reference image too large. Please upload an image under 5 MB." },
        { status: 413 }
      );
    }
    const mime = typeof body.mimeType === "string" ? body.mimeType : "";
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPEG, PNG, WebP, GIF or BMP." },
        { status: 400 }
      );
    }
    mimeType = mime;
  }

  // Optional visitor-supplied credentials (BYOK).
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

  const settings = await getGeneratorSettings();
  if (settings.rate_limit_per_hour > 0) {
    const rl = rateLimit(hashIp(clientIp(request)), settings.rate_limit_per_hour);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached (${settings.rate_limit_per_hour} calls/hour). Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
  }

  const resolved = resolveProvider(override);
  if (!resolved) {
    return NextResponse.json(
      {
        error: override?.apiKey
          ? `Unknown provider "${override.provider}".`
          : "No API key available. Add keys in API Keys or set AI_PROVIDER/AI_API_KEY on the server.",
      },
      { status: 400 }
    );
  }

  const opts = {
    jsonMode: body.jsonMode === true,
    maxTokens: clampNum(body.maxTokens, 64, 8000) ?? undefined,
    temperature: clampNum(body.temperature, 0, 1) ?? undefined,
  };

  try {
    const started = Date.now();
    const text = await callAiProvider(resolved, { prompt: instruction, imageBase64, mimeType }, opts);
    const durationMs = Date.now() - started;
    logUsage({
      ipHash: hashIp(clientIp(request)),
      success: true,
      provider: resolved.def.id,
      model: resolved.model,
      durationMs,
    });
    return NextResponse.json({
      text,
      provider: resolved.def.id,
      model: resolved.model,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed.";
    logUsage({
      ipHash: hashIp(clientIp(request)),
      success: false,
      provider: resolved.def.id,
      model: resolved.model,
      errorMessage: message.slice(0, 500),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Fire-and-forget usage logging - never blocks or breaks the call. */
function logUsage(entry: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    admin.from("usage_logs").insert({ ...entry }).then(undefined, () => {});
  } catch {
    // Service role not configured yet (first run) - ignore.
  }
}
