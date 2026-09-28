/**
 * Local deterministic prompt compiler - live preview path that works
 * without any AI keys. Port of CSV Tree's compileMicrostockPrompt().
 */

import {
  DETAIL_TIERS,
  IP_RISK_PATTERNS,
  IP_RISK_TERMS,
  RASTER_TYPES,
  SIZE_PRESETS,
  VECTOR_COLOR_FORMATS,
  VECTOR_TYPES,
} from "@/lib/prompt-generator/constants";

/** Flat form state shared by the manual engine page. */
export interface PromptFormState {
  keywords?: string;
  description?: string;
  negativeWords?: string;
  referenceNote?: string;
  imageType?: string;
  rasterType?: string;
  vectorColorFormat?: string;
  vectorType?: string;
  iconMode?: string;
  iconLayout?: string;
  iconColCount?: number | string;
  iconCount?: number | string;
  vectorColorCount?: number | string;
  traceFriendly?: boolean;
  sizeId?: string;
  customW?: number | string;
  customH?: number | string;
  ratio?: string;
  ipCheck?: boolean;
  minChars?: number | string;
  maxChars?: number | string;
  count?: number | string;
}

export interface CompiledPrompt {
  prompt: string;
  negativePrompt: string;
  ratio: string;
  imageType: "vector" | "raster";
  vectorType: string;
  rasterType: string;
  size: string;
  meta: { kind: string };
}

export interface PromptVariant extends CompiledPrompt {
  variant: number;
  pro: boolean;
  ts: number;
  subject?: string;
  processing?: boolean;
}

export function tokenize(input: unknown): string[] {
  return String(input || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);
}

export function findIpRisks(text: unknown): string[] {
  const low = String(text || "").toLowerCase();
  const hits: string[] = [];
  IP_RISK_TERMS.forEach((t) => {
    if (low.includes(t)) hits.push(t);
  });
  IP_RISK_PATTERNS.forEach((re) => {
    if (re.exec(low)) hits.push(re.source);
  });
  return [...new Set(hits)];
}

/**
 * Build the positive + negative prompt from the full form state. Returns
 * null until there is a keyword / description to hang the prompt on.
 */
export function compileMicrostockPrompt(s: PromptFormState = {}): CompiledPrompt | null {
  const keywords = tokenize(s.keywords);
  const concept = String(s.description || "").trim();
  const subject = concept || keywords.join(", ") || (s.referenceNote || "").trim();
  if (!subject) return null;

  const isVector = s.imageType === "vector";
  const minChars = Number(s.minChars) || 1500;
  const maxChars = Number(s.maxChars) || 2200;

  let positive: string;
  let negative: string;
  const meta = { kind: isVector ? "vector" : "raster" };

  if (isVector) {
    const vType = VECTOR_TYPES.find((t) => t.id === s.vectorType) || VECTOR_TYPES[0];
    const vColor = VECTOR_COLOR_FORMATS.find((c) => c.id === s.vectorColorFormat) || VECTOR_COLOR_FORMATS[0];
    const colorCount = Number(s.vectorColorCount) || 2;

    let subjectPhrase = subject;
    if (vType.id === "icon" && s.iconMode === "multi") {
      const cols = Number(s.iconColCount) || 4;
      const count = Number(s.iconCount) || 4;
      const rows = Math.ceil(count / cols);
      subjectPhrase = `a responsive icon set of ${count} related icons of ${subject} arranged in ${rows === 1 ? "a single row" : `a clean ${rows} × ${cols} grid`}, sharing one consistent style`;
    } else if (vType.id === "icon") {
      subjectPhrase = `a single flat ${vColor.id === "silhouette" ? "silhouette" : "icon"} of ${subject}`;
    } else {
      subjectPhrase = `a flat vector ${vType.id === "pattern" ? "pattern" : vType.phrase + " of"} ${subject}`;
    }

    const colorPhrase =
      vColor.id === "color"
        ? `${colorCount === 1 ? "one flat color" : `${colorCount} flat colors`}, deliberately chosen palette, ${vColor.phrase}`
        : vColor.phrase;

    const trace =
      s.traceFriendly !== false
        ? "trace-friendly: simple geometric shapes, smooth closed paths, few anchor points, uniform stroke weight, crisp clean edges, no gradient, no gradient mesh, no shading, no texture, no raster effects, fully scalable"
        : "vector, no gradient, crisp edges";

    positive =
      `Vector stock graphic: ${subjectPhrase}. ${colorPhrase}. ${trace}. Flat ${vType.id === "icon" ? (s.iconMode === "multi" ? "icon set" : "icon") : vType.phrase}. ` +
      `Uniform style across all elements, simple silhouette, minimal detail, consistent spacing, white or transparent background, microstock-compatible. ` +
      `Clean composition, sharp detail, professional lighting, balanced color, commercially usable, wide tonal range, tasteful negative space, consistent rendering, accurate scale and proportion, high-resolution output.`;

    negative =
      "gradient, gradient mesh, shading, soft shadows, drop shadows, raster effects, halftone, blur, noise, texture, photorealism, depth of field, perspective distortion, blurry, low quality, low resolution, watermark, text, logo, signature, cropped, out of frame, deformed hands, extra fingers, bad anatomy, ugly, duplicate, jpeg artifacts";
  } else {
    const rType = RASTER_TYPES.find((r) => r.id === s.rasterType) || RASTER_TYPES[0];
    positive =
      `A professional stock image of ${rType.phrase}: ${subject}. ` +
      `High-resolution photograph, crisp focus, true colors, honest materials, no retouching artifacts. ` +
      `Clean composition, sharp detail, professional lighting, balanced color, commercially usable, ` +
      `wide tonal range, tasteful negative space, consistent rendering, accurate scale and proportion, high-resolution output. ` +
      `Versatile stock-ready image suitable for commercial licensing.`;

    negative =
      "blurry, low quality, low resolution, watermark, text, logo, signature, cropped, out of frame, deformed hands, extra fingers, bad anatomy, ugly, duplicate, jpeg artifacts, noise, oversharpened, plastic skin, HDR halos, uncanny valley, cartoon character";
  }

  const negParts = [negative];
  if (s.ipCheck) {
    negParts.push(
      "trademarked logos, brand names, copyrighted characters, celebrity likenesses, real people faces, watermarks, signatures, recognizable buildings"
    );
  }
  if (s.negativeWords) negParts.push(String(s.negativeWords).trim());
  negative = [
    ...new Set(
      negParts
        .filter(Boolean)
        .join(", ")
        .split(",")
    ),
  ]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");

  positive = fitLength(positive, minChars, maxChars);

  if (s.ratio) positive += ` --ar ${s.ratio}`;

  return {
    prompt: positive,
    negativePrompt: negative,
    ratio: s.ratio || "1:1",
    imageType: isVector ? "vector" : "raster",
    vectorType: isVector ? s.vectorType || "icon" : "",
    rasterType: !isVector ? s.rasterType || "background" : "",
    size: sizeLabel(s),
    meta,
  };
}

/** Build `count` deterministic variants off one compilation (local path). */
export function buildVariants(s: PromptFormState, count = 3): PromptVariant[] {
  const base = compileMicrostockPrompt(s);
  if (!base) return [];
  const out: PromptVariant[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      ...base,
      variant: i + 1,
      pro: false,
      ts: Date.now() + i,
    });
  }
  return out;
}

function fitLength(text: string, minChars: number, maxChars: number): string {
  let t = String(text || "").trim();
  const min = Number(minChars) || 1500;
  const max = Number(maxChars) || 2200;
  if (max > 0 && t.length > max) {
    const tailIdx = t.lastIndexOf(" --ar ");
    const tail = tailIdx > 0 ? t.slice(tailIdx) : "";
    let core = tailIdx > 0 ? t.slice(0, tailIdx) : t;
    const need = max - tail.length;
    core = core.slice(0, need).replace(/[,.]?$/, "");
    t = core + tail;
  }
  if (min > 0 && t.length < min && !t.endsWith("--ar")) {
    t = `${t}, ${DETAIL_TIERS.long.slice(0, 4).join(", ")}`;
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

export function sizeLabel(s: PromptFormState = {}): string {
  if (s.sizeId === "custom" && (Number(s.customW) > 0 || Number(s.customH) > 0)) {
    return `${Number(s.customW) || "?"} × ${Number(s.customH) || "?"} px`;
  }
  const p = SIZE_PRESETS.find((x) => x.id === s.sizeId);
  return p ? p.label : "—";
}

export { fitLength };
