import type { GeneratorSettings } from "@/lib/types";

/**
 * Merged generation options: admin defaults (generator_settings) overlaid
 * with the visitor's own controls, clamped server-side to hard limits.
 */
export interface PromptOptions {
  mode: "metadata" | "img2prompt";
  platform: string;
  /** "svg" | "postscript" when the source was a vector file. */
  vector: string | null;
  // metadata
  titleLengthMin: number;
  titleLengthMax: number;
  descriptionWordsMin: number;
  descriptionWordsMax: number;
  keywordsCountMin: number;
  keywordsCountMax: number;
  includeCategory: boolean;
  categories: string[];
  language: string;
  singleWordKw: boolean;
  silhouette: boolean;
  transparent: boolean;
  isPng: boolean;
  prefix: string;
  suffix: string;
  negativeTitleWords: string;
  negativeKeywords: string;
  prohibitedWords: string;
  customPrompt: string;
  // img2prompt
  promptLengthMin: number;
  promptLengthMax: number;
  whiteBackground: boolean;
  cameraParameters: boolean;
  negativePromptWords: string;
}

export function buildPrompt(o: PromptOptions): string {
  return o.mode === "img2prompt" ? buildImg2Prompt(o) : buildMetadata(o);
}

/**
 * Vector source awareness - the key differentiator vs CSV Tree for
 * SVG/AI/EPS files. Vision models default to photographic vocabulary and
 * hallucinate camera details on flat artwork; these notes anchor them.
 */
function vectorAwareness(o: PromptOptions): string {
  if (o.vector === "svg") {
    return `

SOURCE CONTEXT - VECTOR GRAPHIC (SVG):
- This artwork was rasterized from an SVG: expect flat design, icons, logos, line art, illustrations, clipart or UI graphics - NOT a photograph.
- Do NOT invent photographic qualities (camera body, lens, bokeh, depth of field, film grain, lighting setup).
- Describe only what is clearly visible: subjects, style (flat / outline / gradient / cartoon / geometric), color palette and composition.
- Strong vector keywords where accurate: flat design, vector art, illustration, icon, logo, line art, minimalist, scalable, clipart, sticker.
- If the render looks partially blank or broken, describe ONLY the elements you can actually see.`;
  }
  if (o.vector === "postscript") {
    return `

SOURCE CONTEXT - VECTOR GRAPHIC (AI/EPS rendered to image):
- This artwork comes from an Adobe Illustrator / EPS file rendered to a flat image: typically print-ready illustration, logo, label, banner, icon or clipart - NOT a photograph.
- Do NOT invent photographic qualities (camera, lens, bokeh, depth of field, film grain).
- Describe only clearly visible elements: main subject, style, palette, composition.
- Useful vector keywords where accurate: vector art, illustration, editable design, print ready, logo, emblem, badge, clipart.
- If parts of the render appear blank or mis-drawn, ignore them and describe only what is clearly visible.`;
  }
  return "";
}

/** Anti-hallucination contract applied to both modes. */
function accuracyRule(): string {
  return `

ACCURACY CONTRACT:
- Describe ONLY what is clearly visible in the image. Never guess unseen details, brands, locations, seasons or emotions.
- Every keyword must map to something visible. If you cannot reach the keyword target honestly, return fewer honest keywords instead of padding with unrelated ones.
- No unrelated filler words (amazing, beautiful, stunning) unless visually justified.`;
}

/* ---------------------------------------------------------------------- */
/* Metadata mode - ported from CSV Tree's buildPrompt()                    */
/* ---------------------------------------------------------------------- */

function buildMetadata(o: PromptOptions): string {
  const isFreepik = o.platform === "freepik";
  const tcMin = o.titleLengthMin;
  const tcMax = o.titleLengthMax;
  const kcMin = o.keywordsCountMin;
  const kcMax = o.keywordsCountMax;
  const titleCharTarget = Math.round((tcMin + tcMax) / 2);
  const keywordTarget = Math.round((kcMin + kcMax) / 2);

  const schema = [
    `  "title": "descriptive title between ${tcMin} and ${tcMax} characters",`,
    `  "description": "detailed description with ${o.descriptionWordsMin}-${o.descriptionWordsMax} words",`,
    `  "keywords": ["keyword1", "keyword2", ...]`,
  ];
  if (o.includeCategory) {
    schema.push(`  ,"category": "one category exactly from this list: ${o.categories.join(" | ")}"`);
  }
  if (isFreepik) {
    schema.push('  ,"prompt": "single text-to-image prompt that could recreate this image, max 250 chars"');
    schema.push('  ,"baseModel": "leonardo"');
  }

  let prompt = `You are a microstock metadata expert. Analyze this image and generate metadata optimized for ${
    o.platform === "general" ? "all microstock platforms" : o.platform
  }.

Generate the following in valid JSON format:
{
${schema.join("\n")}
}

Requirements:
- Title (STRICT): MUST be between ${tcMin} and ${tcMax} characters long. Aim for around ${titleCharTarget} characters. Count characters carefully. Descriptive and SEO-friendly.
- Keywords (STRICT): MUST return between ${kcMin} and ${kcMax} keywords. Aim for around ${keywordTarget} keywords. Each keyword should be 1-3 words${o.singleWordKw ? ", prefer single-word keywords where possible" : ""}. No duplicates.
- Description: ${o.descriptionWordsMin} to ${o.descriptionWordsMax} words, natural and detailed${
    isFreepik
      ? `\n- Prompt: a single creative text-to-image prompt (under 250 characters) that captures the subject, style, lighting and composition\n- Base model: always set to "leonardo"`
      : ""
  }`;

  if (o.includeCategory) prompt += `\n- Category: choose EXACTLY one category from the provided list.`;
  prompt += vectorAwareness(o);
  prompt += accuracyRule();
  if (o.silhouette) prompt += "\n- If the image contains silhouettes, include silhouette-related keywords";
  if (o.transparent || o.isPng)
    prompt += "\n- If the image has a transparent/white background, mention it in the metadata";
  if (o.isPng) prompt += '\n- The file is a PNG: include "isolated on transparent background" phrasing where appropriate';
  if (o.prefix) prompt += `\n- Always start the title with: "${o.prefix}"`;
  if (o.suffix) prompt += `\n- Always end the title with: "${o.suffix}"`;
  if (o.negativeTitleWords) prompt += `\n- Do NOT use any of these words in the title: ${o.negativeTitleWords}`;
  if (o.negativeKeywords) prompt += `\n- Do NOT include any of these as keywords: ${o.negativeKeywords}`;
  if (o.prohibitedWords)
    prompt += `\n- STRICTLY NEVER use any of these prohibited words anywhere (title, description, keywords): ${o.prohibitedWords}`;
  if (o.language && o.language !== "en") prompt += `\n- Write all metadata in language code: ${o.language}.`;
  if (o.customPrompt) prompt += `\n\nAdditional instructions: ${o.customPrompt}`;

  prompt += "\n\nReturn ONLY valid JSON, no markdown formatting or code blocks.";
  return prompt;
}

/* ---------------------------------------------------------------------- */
/* img2prompt mode - ported from CSV Tree                                  */
/* ---------------------------------------------------------------------- */

function buildImg2Prompt(o: PromptOptions): string {
  const min = o.promptLengthMin;
  const max = o.promptLengthMax;
  const target = Math.round((min + max) / 2);

  let p = `Analyze this image and write a single creative text-to-image prompt that could recreate it. Be specific about subjects, composition, lighting, style and mood.

LENGTH REQUIREMENT (STRICT):
- The prompt MUST be at least ${min} characters long.
- The prompt MUST be at most ${max} characters long.
- Aim for around ${target} characters. Count characters carefully.
- If the natural description is short, add concrete sensory details (texture, palette, lens, light direction, mood) until you reach at least ${min} characters — do NOT pad with filler or repeat sentences.

IMPORTANT OUTPUT RULES:
- Return ONLY the prompt as plain text.
- Do NOT wrap it in JSON, an object, or quotes.
- Do NOT include keys like "prompt", "negative_prompt", "style", "aspect_ratio".
- Do NOT use markdown code fences.
- Do NOT prepend a label, preface or explanation.`;

  if (o.whiteBackground) p += "\nNote: scene is on a clean white background.";
  p += vectorAwareness(o);
  p += accuracyRule();
  if (o.cameraParameters) p += "\nInclude camera parameters (lens, aperture, shutter speed) if appropriate.";
  if (o.negativePromptWords) p += `\nAvoid these words: ${o.negativePromptWords}.`;
  if (o.prohibitedWords) p += `\nSTRICTLY DO NOT use any of these prohibited words anywhere in the prompt: ${o.prohibitedWords}.`;
  if (o.silhouette) p += "\nIf the image is a silhouette, describe its clean outline and note the silhouette.";
  if (o.transparent) p += "\nIf the image has a transparent or white background, note it.";
  if (o.prefix) p += `\nThe prompt must start exactly with: "${o.prefix}"`;
  if (o.suffix) p += `\nThe prompt must end exactly with: "${o.suffix}"`;
  if (o.customPrompt) p += `\nAdditional instructions: ${o.customPrompt}`;
  return p;
}

/** Kept for the simple public API used by tests/docs. */
export function buildDefaultMetadataPrompt(s: GeneratorSettings, platform = "general"): string {
  return buildMetadata({
    mode: "metadata",
    platform,
    vector: null,
    titleLengthMin: s.title_length_min,
    titleLengthMax: s.title_length_max,
    descriptionWordsMin: s.description_words_min,
    descriptionWordsMax: s.description_words_max,
    keywordsCountMin: s.keywords_count_min,
    keywordsCountMax: s.keywords_count_max,
    includeCategory: s.include_category,
    categories: s.categories,
    language: s.language,
    singleWordKw: false,
    silhouette: false,
    transparent: false,
    isPng: false,
    prefix: "",
    suffix: "",
    negativeTitleWords: "",
    negativeKeywords: "",
    prohibitedWords: "",
    customPrompt: s.custom_prompt,
    promptLengthMin: 300,
    promptLengthMax: 700,
    whiteBackground: false,
    cameraParameters: false,
    negativePromptWords: "",
  });
}