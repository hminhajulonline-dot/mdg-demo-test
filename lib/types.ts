export interface ContentBlock {
  title: string;
  body: string;
}

export interface SiteSettings {
  site_name: string;
  site_description: string;
  logo_url: string | null;
  favicon_url: string | null;
  footer_text: string;
  primary_color: string;
  secondary_color: string;
  theme_mode: "light" | "dark" | "system";
  // Page content (Admin > Page Content)
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  about_title: string;
  about_body: string;
  features: ContentBlock[];
  steps: ContentBlock[];
  /** Provider ids the admin has enabled for the API Keys modal. */
  enabled_providers: string[];
}

export const ALL_PROVIDER_IDS = [
  "cloudflare", "groq", "gemini", "mistral", "openai", "openrouter",
  "nvidia", "github", "cohere", "together", "sambanova", "deepinfra",
  "cerebras",
];

export interface GeneratorSettings {
  title_length_min: number;
  title_length_max: number;
  description_words_min: number;
  description_words_max: number;
  keywords_count_min: number;
  keywords_count_max: number;
  include_category: boolean;
  categories: string[];
  language: string;
  custom_prompt: string;
  max_images_per_batch: number;
  rate_limit_per_hour: number;
}

export interface GeneratedMetadata {
  title: string;
  description: string;
  keywords: string[];
  category?: string;
  /** Dreamstime extras - up to 3 categories, AI-picked names. */
  categories?: string[];
  /** Freepik (Magnific) extras */
  prompt?: string;
  baseModel?: string;
}

/** Generator tool mode, mirroring CSV Tree. */
export type GenerationMode = "metadata" | "img2prompt";

/**
 * Length/count bounds of one generated field - drives the green/amber
 * badge under each result field (port of CSV Tree's BoundsBadge).
 */
export interface FieldBounds {
  min: number;
  max: number;
  length: number;
  ok: boolean;
}

export interface ResultBounds {
  title?: FieldBounds;
  keywords?: FieldBounds;
  /** Present only in char mode (Dreamstime). */
  description?: FieldBounds;
  /** img2prompt mode. */
  prompt?: FieldBounds;
}

/**
 * Per-visitor generator options (persisted in the visitor's localStorage).
 * Mirrors every control of the CSV Tree Generator sidebar.
 */
export interface GeneratorUserSettings {
  mode: GenerationMode;
  // metadata mode
  titleLengthMin: number;
  titleLengthMax: number;
  keywordsCountMin: number;
  keywordsCountMax: number;
  // Description range - words normally, characters when the platform is
  // Dreamstime (CSV Tree measures Dreamstime descriptions in chars).
  descriptionLengthMin: number;
  descriptionLengthMax: number;
  useDescPrefix: boolean;
  descPrefix: string;
  useDescSuffix: boolean;
  descSuffix: string;
  usePrefix: boolean;
  prefix: string;
  useSuffix: boolean;
  suffix: string;
  useNegativeTitle: boolean;
  negativeTitleWords: string;
  useNegativeKeywords: boolean;
  negativeKeywords: string;
  // img2prompt mode
  promptLengthMin: number;
  promptLengthMax: number;
  whiteBackground: boolean;
  cameraParameters: boolean;
  useNegativePrompt: boolean;
  negativePromptWords: string;
  // shared optional block
  singleWordKw: boolean;
  silhouette: boolean;
  transparent: boolean;
  useCustomPrompt: boolean;
  customPrompt: string;
  useProhibitedWords: boolean;
  prohibitedWords: string;
  // dreamstime
  isAIGenerated: boolean;
}

export const DEFAULT_USER_SETTINGS: GeneratorUserSettings = {
  mode: "metadata",
  titleLengthMin: 40,
  titleLengthMax: 100,
  keywordsCountMin: 20,
  keywordsCountMax: 30,
  descriptionLengthMin: 12,
  descriptionLengthMax: 30,
  useDescPrefix: false,
  descPrefix: "",
  useDescSuffix: false,
  descSuffix: "",
  usePrefix: false,
  prefix: "",
  useSuffix: false,
  suffix: "",
  useNegativeTitle: false,
  negativeTitleWords: "",
  useNegativeKeywords: false,
  negativeKeywords: "",
  promptLengthMin: 300,
  promptLengthMax: 700,
  whiteBackground: false,
  cameraParameters: false,
  useNegativePrompt: false,
  negativePromptWords: "",
  singleWordKw: false,
  silhouette: false,
  transparent: false,
  useCustomPrompt: false,
  customPrompt: "",
  useProhibitedWords: false,
  prohibitedWords: "",
  isAIGenerated: false,
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site_name: "Microstock Metadata Generator",
  site_description: "AI-powered metadata generation for microstock contributors.",
  logo_url: null,
  favicon_url: null,
  footer_text: "Free AI-powered metadata generator for microstock contributors.",
  primary_color: "#16A34A",
  secondary_color: "#0F172A",
  theme_mode: "system",
  hero_badge: "Free - built for microstock contributors",
  hero_title: "AI-powered metadata for your microstock uploads",
  hero_subtitle:
    "Upload images and instantly get optimized titles, descriptions, keywords and categories - ready to export for every major stock platform.",
  about_title: "About",
  about_body:
    "The Microstock Metadata Generator helps stock contributors write better titles, descriptions, keywords and categories for their images - in seconds instead of minutes.\n\nUpload one or more images and an AI vision model analyzes each photo, producing marketplace-optimized metadata you can review, edit, copy, or export as a CSV matching your platform upload template.\n\nUploaded images are processed transiently in memory and are never stored permanently on the server.",
  features: [
    { title: "AI Metadata", body: "Upload any image and get an optimized title, description, keywords and category in seconds." },
    { title: "Bulk Processing", body: "Queue multiple images at once with live progress, automatic retries and a stop button." },
    { title: "Platform CSV Export", body: "Ready-to-upload CSVs for Adobe Stock, Shutterstock, Freepik, Vecteezy, Dreamstime and more." },
    { title: "13 AI Providers", body: "Bring your own keys - Groq, Gemini, OpenAI and more rotate automatically with cross-provider fallback." },
  ],
  steps: [
    { title: "Upload", body: "Drag & drop or select one or more images." },
    { title: "Generate", body: "The AI analyzes each image and writes marketplace-ready metadata." },
    { title: "Export", body: "Review, tweak if needed, then download a platform-perfect CSV." },
  ],
  enabled_providers: ALL_PROVIDER_IDS,
};

export const DEFAULT_GENERATOR_SETTINGS: GeneratorSettings = {
  title_length_min: 40,
  title_length_max: 100,
  description_words_min: 30,
  description_words_max: 60,
  keywords_count_min: 20,
  keywords_count_max: 30,
  include_category: true,
  categories: [
    "Animals", "Buildings and Architecture", "Business", "Drinks",
    "The Environment", "States of Mind", "Food", "Graphic Resources",
    "Hobbies and Leisure", "Industry", "Landscapes", "Lifestyle",
    "People", "Plants and Flowers", "Culture and Religion", "Science",
    "Social Issues", "Sports", "Technology", "Transport", "Travel",
  ],
  language: "en",
  custom_prompt: "",
  max_images_per_batch: 10,
  rate_limit_per_hour: 30,
};

/** Result item tracked client-side per uploaded image. */
export interface GenerationResult extends GeneratedMetadata {
  id: string;
  filename: string;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
}
