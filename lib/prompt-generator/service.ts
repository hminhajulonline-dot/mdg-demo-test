/**
 * AI passes for the prompt generator - port of CSV Tree's
 * researchKeywordsWithAi / describeReferenceImage / ipAuditWithAi /
 * polishOneWithAi / polishNWithAi, routed through our BYOK attempt loop
 * (lib/client/textAi.ts) instead of the Firestore-credited tool gate.
 */

import { runTextAi } from "@/lib/client/textAi";
import { sizeLabel, tokenize, type PromptFormState, type CompiledPrompt, fitLength } from "@/lib/prompt-generator/compile";
import {
  asDescribeImage,
  parseJsonStrict,
  type DescribeImageJson,
  type IpAuditJson,
  type PromptJson,
  type PromptsJson,
} from "@/lib/prompt-generator/json";

export interface FallbackInfo {
  from: string;
  to: string;
  reason: string;
}

export interface PassOptions {
  onFallback?: (f: FallbackInfo) => void;
  onStatus?: (msg: string) => void;
  isCancelled?: () => boolean;
}

function toRunOptions(o: PassOptions, extra: { imageBase64?: string; mimeType?: string } = {}) {
  return {
    jsonMode: true,
    imageBase64: extra.imageBase64,
    mimeType: extra.mimeType,
    isCancelled: o.isCancelled,
    onStatus: o.onStatus,
    onFallback: o.onFallback ? (from: string, to: string, reason: string) => o.onFallback?.({ from, to, reason }) : undefined,
  };
}

function describeImageAs(): string {
  return `Return STRICT JSON only, no markdown, no prose:
{
  "description":"one vivid sentence describing what should appear in this microstock image",
  "subject":"the core subject phrase",
  "keywords":["5-8 microstock-safe keywords"]
}`;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

/**
 * Expand a short keyword list into researched, microstock-ready keywords.
 */
export async function researchKeywordsWithAi(keywords: string, opts: PassOptions = {}) {
  const instruction = `You are a microstock keyword researcher. Turn these user keywords into a deeper, sales-optimized set:
USER: "${keywords}"

Rules: no brands, no celebrities, no trademarked characters. Add buyer-intent synonyms, style/format qualifiers and commercial-use phrasings.

${describeImageAs()}`;
  const { text, provider } = await runTextAi(instruction, toRunOptions(opts));
  const parsed = asDescribeImage(parseJsonStrict(text));
  return {
    description: parsed.description || keywords,
    subject: parsed.subject || keywords,
    keywords: asStringArray(parsed.keywords).length
      ? asStringArray(parsed.keywords)
      : tokenize(keywords),
    provider,
  };
}

/**
 * Analyze an uploaded reference image (vision) into subject + description +
 * keywords so the prompt can clone or riff off it.
 */
export async function describeReferenceImage(
  imageBase64: string,
  mimeType = "image/png",
  opts: PassOptions = {}
) {
  const instruction = `Describe this image professionally for a microstock prompt generator. Capture content, style, color, arrangement. Avoid any brand/celebrity/character names — keep it generic.

${describeImageAs()}`;
  const { text, provider } = await runTextAi(
    instruction,
    toRunOptions(opts, { imageBase64, mimeType })
  );
  const parsed: DescribeImageJson = asDescribeImage(parseJsonStrict(text));
  return {
    description: parsed.description || "",
    subject: parsed.subject || "",
    keywords: asStringArray(parsed.keywords),
    provider,
  };
}

/**
 * AI IP / copyright audit: flag brand, celebrity, character or other
 * rejectable content before the prompt is generated.
 */
export async function ipAuditWithAi(text: string, opts: PassOptions = {}) {
  const instruction = `You are a microstock submission reviewer. Audit this concept text for content that must NOT appear in a stock image prompt (brands, logos, celebrities, real people likeness, copyrighted characters, famous buildings, recognizable products).

CONCEPT:
"${text}"

Return STRICT JSON only:
{
  "safe": true or false,
  "risks": ["list each risky term found, or []"],
  "note": "one short sentence: either okay-to-proceed or why it is risky"
}`;
  const { text: raw, provider } = await runTextAi(instruction, toRunOptions(opts));
  const obj = parseJsonStrict(raw);
  const parsed: IpAuditJson = typeof obj === "object" && obj !== null ? (obj as IpAuditJson) : {};
  return {
    safe: parsed.safe !== false,
    risks: asStringArray(parsed.risks),
    note: parsed.note || "",
    provider,
  };
}

/**
 * Generate a single polished prompt variant.
 */
export async function polishOneWithAi(
  s: PromptFormState,
  compiled: CompiledPrompt | null,
  opts: PassOptions = {}
) {
  const minChars = Number(s.minChars) || 1500;
  const maxChars = Number(s.maxChars) || 2200;
  const isVector = s.imageType === "vector";
  const instruction = `Generate 1 unique microstock image prompt.

Image type: ${isVector ? "VECTOR (flat, no gradient, trace-ready)" : "RASTER (photorealistic photo)"}
Aspect ratio: ${s.ratio}
Size: ${sizeLabel(s)}
Keywords: ${tokenize(s.keywords).join(", ")}
${s.description ? `Description: ${s.description}` : ""}
${isVector ? `Vector type: ${s.vectorType}, color: ${s.vectorColorFormat}, trace-friendly: ${s.traceFriendly !== false}` : `Raster type: ${s.rasterType}`}

Rules:
- Prompt must be 1500-2200 characters
- No brands, celebrities, or copyrighted content
- No "Prompt:" prefix — just the description text
- Include rich detail: lighting, composition, mood, texture, style

Respond with ONLY this JSON (no other text):
{"prompt":"full prompt text","negativePrompt":"things to avoid"}`;
  const { text, provider } = await runTextAi(instruction, toRunOptions(opts));
  const obj = parseJsonStrict(text);
  const parsed: PromptJson = typeof obj === "object" && obj !== null ? (obj as PromptJson) : {};
  return {
    prompt: fitLength(String(parsed.prompt || "").trim(), minChars, maxChars),
    negativePrompt: String(parsed.negativePrompt || compiled?.negativePrompt || ""),
    provider,
  };
}

/**
 * Generate a set of `count` polished prompt variants honoring min/max length.
 */
export async function polishNWithAi(
  s: PromptFormState,
  compiled: CompiledPrompt | null,
  count = 3,
  opts: PassOptions = {}
) {
  const minChars = Number(s.minChars) || 1500;
  const maxChars = Number(s.maxChars) || 2200;
  const isVector = s.imageType === "vector";
  const instruction = `Generate ${count} unique microstock image prompts.

Image type: ${isVector ? "VECTOR (flat, no gradient, trace-ready)" : "RASTER (photorealistic photo)"}
Aspect ratio: ${s.ratio}
Size: ${sizeLabel(s)}
Keywords: ${tokenize(s.keywords).join(", ")}
${s.description ? `Description: ${s.description}` : ""}
${isVector ? `Vector type: ${s.vectorType}, color: ${s.vectorColorFormat}, trace-friendly: ${s.traceFriendly !== false}` : `Raster type: ${s.rasterType}`}

Rules:
- Each prompt 1500-2200 characters
- No brands, celebrities, or copyrighted content
- No "Prompt:" prefix — just the description text
- Each prompt must be completely different from the others
- Include rich detail: lighting, composition, mood, texture, style

Respond with ONLY this JSON (no other text):
{"prompts":[{"prompt":"full prompt text","negativePrompt":"things to avoid"}]}`;
  const { text, provider } = await runTextAi(instruction, toRunOptions(opts));
  const obj = parseJsonStrict(text);
  const parsed: PromptsJson = typeof obj === "object" && obj !== null ? (obj as PromptsJson) : {};
  const list = Array.isArray(parsed.prompts)
    ? parsed.prompts.map((p) => ({
        prompt: fitLength(String(p.prompt || "").trim(), minChars, maxChars),
        negativePrompt: String(p.negativePrompt || compiled?.negativePrompt || ""),
      }))
    : [];
  return { prompts: list, provider };
}
