/**
 * Microstock Prompt Generator - constant banks.
 * Port of CSV Tree's promptGeneratorService constants (manual engine).
 */

// 1x1 transparent PNG placeholder for text-only AI calls.
export const PLACEHOLDER_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export interface ModelTarget {
  id: string;
  name: string;
  note: string;
  arSuffix: boolean;
}

export const TARGET_MODELS: ModelTarget[] = [
  { id: "midjourney", name: "Midjourney", note: "Append --ar {ratio}", arSuffix: true },
  { id: "dalle3", name: "DALL·E 3", note: "Ratio set separately", arSuffix: false },
  { id: "sdxl", name: "Stable Diffusion XL", note: "Ratio set separately", arSuffix: false },
  { id: "flux", name: "FLUX.1", note: "Ratio set separately", arSuffix: false },
  { id: "leonardo", name: "Leonardo AI", note: "Ratio set separately", arSuffix: false },
  { id: "firefly", name: "Adobe Firefly", note: "Ratio set separately", arSuffix: false },
  { id: "imagen3", name: "Google Imagen 3", note: "Ratio set separately", arSuffix: false },
  { id: "ideogram", name: "Ideogram", note: "Append --ar {ratio}", arSuffix: true },
  { id: "recraft", name: "Recraft", note: "Good for vector styles", arSuffix: false },
];

export interface StockPlatform {
  id: string;
  name: string;
  license: string;
  ratioHint: string;
}

export const STOCK_PLATFORMS: StockPlatform[] = [
  { id: "adobe", name: "Adobe Stock", license: "Commercial", ratioHint: "4:5 & 1:1 popular" },
  { id: "shutterstock", name: "Shutterstock", license: "Extended", ratioHint: "16:9 & 1:1 popular" },
  { id: "getty", name: "Getty Images", license: "Editorial+", ratioHint: "3:2 & 16:9 dominant" },
  { id: "istock", name: "iStock", license: "Commercial", ratioHint: "4:5 vertical strong" },
  { id: "dreamstime", name: "Dreamstime", license: "Commercial", ratioHint: "Square versatile" },
  { id: "alamy", name: "Alamy", license: "Editorial+", ratioHint: "3:2 landscape" },
  { id: "123rf", name: "123RF", license: "Commercial", ratioHint: "All ratios accepted" },
  { id: "depositphotos", name: "Depositphotos", license: "Commercial", ratioHint: "1:1 fast sale" },
  { id: "freepik", name: "Freepik", license: "Commercial", ratioHint: "Vertical UI-friendly" },
];

export interface AspectRatio {
  value: string;
  label: string;
  hint: string;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { value: "1:1", label: "Square", hint: "Square" },
  { value: "16:9", label: "Widescreen", hint: "16:9" },
  { value: "4:5", label: "Vertical", hint: "4:5" },
  { value: "9:16", label: "Story", hint: "9:16" },
  { value: "3:2", label: "Landscape", hint: "3:2" },
  { value: "2:3", label: "Portrait", hint: "2:3" },
  { value: "21:9", label: "Ultra-wide", hint: "21:9" },
  { value: "9:21", label: "Ultra-tall", hint: "9:21" },
];

// Image type - the single most important filter for stock submissions.
export const IMAGE_TYPES = [
  { id: "raster", label: "Raster", hint: "Photo / pixel — print & web", note: "Photorealistic or rendered raster output." },
  { id: "vector", label: "Vector", hint: "Scalable flat artwork — no gradient", note: "Clean vectors built for AI tracing / Live Trace." },
] as const;

// Raster subtypes - "type" of the raster deliverable.
export const RASTER_TYPES = [
  { id: "background", label: "Background", phrase: "versatile seamless background image" },
  { id: "showcase", label: "Showcase", phrase: "hero showcase image for a product or brand" },
  { id: "mockup", label: "Mockup", phrase: "presentation mockup on a realistic surface" },
  { id: "banner", label: "Banner", phrase: "wide-format banner" },
  { id: "poster", label: "Poster", phrase: "print-ready poster" },
  { id: "wallpaper", label: "Wallpaper", phrase: "desktop wallpaper composition" },
  { id: "texture", label: "Texture", phrase: "macro texture" },
  { id: "pattern", label: "Pattern", phrase: "seamless repeating pattern" },
  { id: "product", label: "Product shot", phrase: "professional product photograph" },
  { id: "lifestyle", label: "Lifestyle scene", phrase: "lifestyle scene with people using the subject" },
  { id: "scene", label: "Scene", phrase: "cinematic scene" },
  { id: "flatlay", label: "Flat lay", phrase: "top-down flat lay" },
  { id: "editorial", label: "Editorial", phrase: "editorial photograph with space for copy" },
  { id: "food", label: "Food", phrase: "appetizing food photography" },
  { id: "travel", label: "Travel", phrase: "destination travel photograph" },
  { id: "corporate", label: "Corporate", phrase: "clean corporate / business scene" },
  { id: "portrait", label: "Portrait", phrase: "studio portrait" },
  { id: "landscape", label: "Landscape", phrase: "landscape photograph" },
];

// Vector color formats.
export const VECTOR_COLOR_FORMATS = [
  { id: "color", label: "Color", phrase: "solid flat color fills" },
  { id: "bw", label: "Black & white", phrase: "black and white, monochrome" },
  { id: "silhouette", label: "Silhouette", phrase: "solid silhouette with negative space" },
];

// Vector deliverable types.
export const VECTOR_TYPES = [
  { id: "icon", label: "Icon", phrase: "icon" },
  { id: "symbol", label: "Symbol", phrase: "symbol" },
  { id: "graphics", label: "Graphic element", phrase: "graphic element" },
  { id: "badge", label: "Badge / emblem", phrase: "badge, emblem, monogram" },
  { id: "ornament", label: "Ornament", phrase: "ornamental flourish / divider" },
  { id: "label", label: "Label / tag", phrase: "label, tag, price-tag" },
  { id: "sticker", label: "Sticker", phrase: "sticker-style graphic" },
  { id: "pattern", label: "Pattern", phrase: "seamless pattern" },
  { id: "infographic", label: "Infographic element", phrase: "infographic element" },
  { id: "illustration", label: "Illustration", phrase: "scene illustration" },
];

// Icon modes + grid layouts.
export const ICON_MODES = [
  { id: "single", label: "Single icon" },
  { id: "multi", label: "Icon set" },
];

export const ICON_LAYOUTS = [
  { id: "row", label: "Row" },
  { id: "column", label: "Column" },
  { id: "grid", label: "Grid" },
];

export const VECTOR_COLOR_COUNTS = [1, 2, 3, 4, 5, 6];

// Size presets - preset list per image type plus free custom.
export interface SizePreset {
  id: string;
  kind: string;
  label: string;
  w: number;
  h: number;
  note: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "raster-small", kind: "raster", label: "1024 × 1024", w: 1024, h: 1024, note: "Fast preview" },
  { id: "raster-2k", kind: "raster", label: "2048 × 2048", w: 2048, h: 2048, note: "Web / social" },
  { id: "raster-4k", kind: "raster", label: "4096 × 4096", w: 4096, h: 4096, note: "Agency-print safe" },
  { id: "raster-3:2", kind: "raster", label: "4096 × 2730", w: 4096, h: 2730, note: "Landscape 3:2" },
  { id: "raster-2:3", kind: "raster", label: "2730 × 4096", w: 2730, h: 4096, note: "Portrait 2:3" },
  { id: "raster-16:9", kind: "raster", label: "4096 × 2304", w: 4096, h: 2304, note: "Widescreen 16:9" },
  { id: "vector-512", kind: "vector", label: "512 × 512", w: 512, h: 512, note: "Compact icon" },
  { id: "vector-1k", kind: "vector", label: "1024 × 1024", w: 1024, h: 1024, note: "Standard icon" },
  { id: "vector-2k", kind: "vector", label: "2048 × 2048", w: 2048, h: 2048, note: "Retina / print" },
];

// Negative-caption banks (seeded default quality fixes).
export const CAPTION_BANK = [
  {
    id: "default",
    label: "General quality",
    negative:
      "blurry, low quality, low resolution, watermark, text, logo, signature, cropped, out of frame, deformed hands, extra fingers, bad anatomy, ugly, duplicate, jpeg artifacts, noise, oversharpened",
  },
  {
    id: "photoreal",
    label: "Photo-real fixes",
    negative:
      "plastic skin, oversharpened, HDR halos, contrast boosted, fake bokeh, uncanny valley, wax skin, cartoon character, illustration style in a photo",
  },
  {
    id: "vector",
    label: "Vector / flat fixes",
    negative:
      "gradient, gradient mesh, shading, soft shadows, drop shadows, raster effects, halftone, blur, noise, texture, photorealism, depth of field, perspective distortion",
  },
  {
    id: "render3d",
    label: "3D render fixes",
    negative:
      "blender default render, flat shading, topology lines, viewport grid, untextured grey, clay material, wrong scale, low poly artifacts",
  },
];

// Local IP / copyright risk heuristics. The AI audit is the real check; this
// list catches the most common stock-site rejections before a prompt is built.
export const IP_RISK_TERMS = [
  "nike", "adidas", "gucci", "louis vuitton", "dior", "chanel", "versace",
  "lacoste", "puma", "reebok", "apple logo", "google logo", "microsoft",
  "samsung logo", "xiaomi", "huawei", "disney", "mickey mouse", "minnie mouse",
  "star wars", "pokemon", "pikachu", "mario", "super mario", "sonic",
  "harry potter", "lord of the rings", "marvel", "avengers", "spider-man",
  "spiderman", "batman", "superman", "wonder woman", "iron man", "captain america",
  "mcdonald", "kfc", "burger king", "coca-cola", "pepsi", "starbucks",
  "red bull", "monster energy", "tesla logo", "bmw logo", "mercedes-benz logo",
  "audi logo", "ferrari logo", "lamborghini", "porsche logo", "rolls-royce",
  "harley-davidson", "lego", "barbie", "hello kitty", "sanrio", "garfield",
  "peanuts", "snoopy", "garfield", "trump", "biden", "obama", "queen elizabeth",
  "taylor swift", "beyonce", "elon musk", "cristiano ronaldo", "lionel messi",
  "virat kohli", "shah rukh khan", "tom cruise", "bruce lee",
];

export const IP_RISK_PATTERNS: RegExp[] = [
  /\b(logo\sof|branded|brand name|trademark)\b/i,
  /\b(celebrit|famous|well-known|real person)\b/i,
  /\bcopyright(ed)?\b/i,
];

export const AUTO_SAFETY_NEGATIVES =
  "trademarked logos, brand names, copyrighted characters, celebrity likenesses, real people faces, watermarks, signatures, recognizable buildings";

// Detail tiers used to expand the prompt toward the requested character count.
export const DETAIL_TIERS: Record<string, string[]> = {
  short: ["clean composition", "sharp detail"],
  medium: ["clean composition", "sharp detail", "professional lighting", "balanced color", "commercially usable"],
  long: [
    "clean composition", "sharp detail", "professional lighting", "balanced color",
    "commercially usable", "wide tonal range", "tasteful negative space",
    "consistent rendering", "accurate scale and proportion", "high-resolution output",
  ],
};

export const LENGTH_OPTIONS = [
  { id: "short", label: "Short", hint: "~200–400 chars" },
  { id: "medium", label: "Medium", hint: "~400–800 chars" },
  { id: "long", label: "Long", hint: "~800+ chars" },
];
