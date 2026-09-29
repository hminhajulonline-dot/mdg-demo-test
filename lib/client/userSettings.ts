"use client";

import { DEFAULT_USER_SETTINGS, type GeneratorUserSettings } from "@/lib/types";

/**
 * Visitor generator controls - persisted per browser, exposed through an
 * external store so components can useSyncExternalStore (SSR-safe).
 */
const KEY = "mmg-generator-settings-v1";
const EXT_KEY = "mmg-export-ext";
const EVENT = "mmg-user-settings";

let cache: GeneratorUserSettings | null = null;
let extCache: string | null = null;

function load(): GeneratorUserSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_USER_SETTINGS, ...(typeof parsed === "object" ? parsed : {}) };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function getUserSettings(): GeneratorUserSettings {
  if (!cache) cache = load();
  return cache;
}

export function getServerUserSettings(): GeneratorUserSettings {
  return DEFAULT_USER_SETTINGS;
}

export function setUserSettings(patch: Partial<GeneratorUserSettings>): void {
  const next = { ...getUserSettings(), ...patch };
  // Keep invariants sane.
  next.titleLengthMax = Math.max(next.titleLengthMax, next.titleLengthMin + 5);
  next.keywordsCountMax = Math.max(next.keywordsCountMax, next.keywordsCountMin + 1);
  next.descriptionLengthMax = Math.max(next.descriptionLengthMax, next.descriptionLengthMin + 1);
  next.promptLengthMax = Math.max(next.promptLengthMax, next.promptLengthMin + 50);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function resetUserSettings(): void {
  cache = DEFAULT_USER_SETTINGS;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeUserSettings(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/* Export extension override ('' = original filename). */
export function getExportExt(): string {
  if (extCache === null) {
    try {
      extCache = localStorage.getItem(EXT_KEY) || "";
    } catch {
      extCache = "";
    }
  }
  return extCache;
}
export function getServerExportExt(): string {
  return "";
}
export function setExportExt(v: string): void {
  extCache = v;
  try {
    localStorage.setItem(EXT_KEY, v);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/* Export platform selection. */
const PLATFORM_KEY = "mmg-platform";
let platformCache: string | null = null;

export function getPlatform(): string {
  if (platformCache === null) {
    try {
      platformCache = localStorage.getItem(PLATFORM_KEY) || "adobestock";
    } catch {
      platformCache = "adobestock";
    }
  }
  return platformCache;
}
export function getServerPlatform(): string {
  return "adobestock";
}
export function setPlatform(p: string): void {
  platformCache = p;
  try {
    localStorage.setItem(PLATFORM_KEY, p);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
