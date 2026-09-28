"use client";

/**
 * Multi-provider BYOK key store - port of CSV Tree's rotation engine.
 *
 * - Multiple keys per provider, stored obfuscated in localStorage.
 * - One 'active' key per provider + healthy pool with cooldowns.
 * - Auto-fallback: selected provider first, then other providers that
 *   have eligible keys (vision-capable first).
 */

const STORAGE_KEY = "mmg_api_keys_v2";
const PROVIDER_KEY = "mmg_ai_provider";
const FALLBACK_KEY = "mmg_auto_fallback";
const SALT = "mmg-2026-key-store";

export const KEY_REHAB_MS = 5 * 60 * 1000; // transient errors
export const QUOTA_REHAB_MS = 60 * 60 * 1000; // daily quota exhaustion
export const MAX_REHAB_MS = 6 * 60 * 60 * 1000;

interface KeyEntry {
  id: string;
  value: string; // obfuscated
  status: "active" | "healthy" | "unhealthy";
  addedAt: number;
  lastUsed: number;
  health?: "healthy" | "unhealthy";
  lastFailedAt?: number;
  cooldownMs?: number;
}

type KeyStore = Record<string, KeyEntry[]>;

function obfuscate(text: string): string {
  if (!text) return "";
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    out.push(String.fromCharCode(text.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length)));
  }
  try {
    return btoa(unescape(encodeURIComponent(out.join(""))));
  } catch {
    return text;
  }
}

function deobfuscate(text: string): string {
  if (!text) return "";
  try {
    const decoded = decodeURIComponent(escape(atob(text)));
    const out: string[] = [];
    for (let i = 0; i < decoded.length; i++) {
      out.push(String.fromCharCode(decoded.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length)));
    }
    return out.join("");
  } catch {
    return text;
  }
}

function readRawStore(): KeyStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function writeRawStore(store: KeyStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
  window.dispatchEvent(new Event("mmg-keys-change"));
}

function makeKeyEntry(value: string, makeActive = false): KeyEntry {
  return {
    id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    value: obfuscate(value.trim()),
    status: makeActive ? "active" : "healthy",
    addedAt: Date.now(),
    lastUsed: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function listKeys(provider: string): Array<KeyEntry & { plain: string }> {
  const store = readRawStore();
  return (store[provider] || []).map((k) => ({ ...k, plain: deobfuscate(k.value) }));
}

export function listKeysMasked(provider: string) {
  return listKeys(provider).map((k) => ({
    id: k.id,
    masked: maskKey(k.plain),
    status: k.status,
    health: k.health || "healthy",
    lastFailedAt: k.lastFailedAt,
    cooldownMs: k.cooldownMs,
    addedAt: k.addedAt,
  }));
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 12) return `${key.slice(0, 2)}...`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function addKey(provider: string, value: string): void {
  const trimmed = (value || "").trim();
  if (!trimmed) throw new Error("API key is empty.");
  const store = readRawStore();
  const list = store[provider] || [];
  if (list.some((k) => deobfuscate(k.value) === trimmed)) {
    throw new Error("This key is already saved.");
  }
  list.push(makeKeyEntry(trimmed, list.length === 0));
  store[provider] = list;
  writeRawStore(store);
}

export function removeKey(provider: string, keyId: string): void {
  const store = readRawStore();
  const list = (store[provider] || []).filter((k) => k.id !== keyId);
  if (list.length && !list.some((k) => k.status === "active")) list[0].status = "active";
  store[provider] = list;
  writeRawStore(store);
}

export function setActiveKey(provider: string, keyId: string): void {
  const store = readRawStore();
  const list = store[provider] || [];
  list.forEach((k) => {
    if (k.id === keyId) k.status = "active";
    else if (k.status === "active") k.status = "healthy";
  });
  store[provider] = list;
  writeRawStore(store);
}

export function getSelectedProvider(): string {
  try {
    return localStorage.getItem(PROVIDER_KEY) || "groq";
  } catch {
    return "groq";
  }
}

/** True when at least one API key exists for any provider. */
export function hasAnyKey(): boolean {
  const store = readRawStore();
  return Object.values(store).some((list) => Array.isArray(list) && list.length > 0);
}

export function setSelectedProvider(provider: string): void {
  try {
    localStorage.setItem(PROVIDER_KEY, provider);
  } catch {}
  window.dispatchEvent(new Event("mmg-keys-change"));
}

export function getAutoFallback(): boolean {
  try {
    return localStorage.getItem(FALLBACK_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Subscribe to any key-store change (add/remove/active/health). */
export function subscribeKeys(cb: () => void): () => void {
  window.addEventListener("mmg-keys-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("mmg-keys-change", cb);
    window.removeEventListener("storage", cb);
  };
}

export function setAutoFallback(v: boolean): void {
  try {
    localStorage.setItem(FALLBACK_KEY, v ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event("mmg-keys-change"));
}

function isKeyEligible(k: KeyEntry): boolean {
  const isUnhealthy = k.health === "unhealthy" || k.status === "unhealthy";
  if (!isUnhealthy) return true;
  if (!k.lastFailedAt) return true;
  return Date.now() - k.lastFailedAt > (k.cooldownMs || KEY_REHAB_MS);
}

/** Active (or first eligible) key of a provider. */
export function getActiveKeyValue(provider: string): string | null {
  const keys = listKeys(provider);
  if (!keys.length) return null;
  const active = keys.find((k) => k.status === "active");
  const pool = [active, ...keys.filter((k) => k !== active)].filter(Boolean) as typeof keys;
  const ok = pool.find((k) => isKeyEligible(k));
  return ok ? ok.plain : null;
}

export interface AttemptPlanEntry {
  providerId: string;
  keyValue: string;
}

/**
 * Attempt plan across all configured providers: selected provider's
 * eligible keys first, then every other provider's keys when auto-fallback
 * is on (vision providers before text-only ones).
 */
export function buildAttemptPlan(selectedProvider?: string): AttemptPlanEntry[] {
  const selected = selectedProvider || getSelectedProvider();
  const fallbackOn = getAutoFallback();
  const store = readRawStore();

  const plan: AttemptPlanEntry[] = [];
  const push = (id: string, eligible: boolean) => {
    for (const k of store[id] || []) {
      if (isKeyEligible(k) === eligible) {
        plan.push({ providerId: id, keyValue: deobfuscate(k.value) });
      }
    }
  };

  // Fallback order: vision-capable providers first, text-only last.
  const order = [
    "groq", "gemini", "openai", "openrouter", "mistral", "cohere",
    "sambanova", "nvidia", "cloudflare", "github", "together", "deepinfra",
    "cerebras",
  ];
  const chain = fallbackOn ? [selected, ...order.filter((id) => id !== selected)] : [selected];

  // 1) healthy keys first, 2) cooldown keys as a last resort (CSV Tree
  // behaviour - an empty plan would silently fall to the server key).
  for (const id of chain) push(id, true);
  for (const id of chain) push(id, false);
  return plan;
}

/** Daily quota trips - park EVERY key of the provider at once. */
export function markAllProviderKeysUnhealthy(providerId: string, cooldownMs?: number) {
  const store = readRawStore();
  const list = store[providerId] || [];
  const cd = Math.min(MAX_REHAB_MS, Math.max(QUOTA_REHAB_MS, cooldownMs ?? QUOTA_REHAB_MS));
  list.forEach((k) => {
    k.health = "unhealthy";
    k.lastFailedAt = Date.now();
    k.cooldownMs = cd;
  });
  store[providerId] = list;
  writeRawStore(store);
}

/** Mark a failed attempt so the key sits out for a while. */
export function markKeyUnhealthy(providerId: string, keyValue: string, cooldownMs?: number) {
  const store = readRawStore();
  const list = store[providerId] || [];
  const cd = Math.min(MAX_REHAB_MS, Math.max(KEY_REHAB_MS, cooldownMs ?? KEY_REHAB_MS));
  list.forEach((k) => {
    if (deobfuscate(k.value) === keyValue) {
      k.health = "unhealthy";
      k.lastFailedAt = Date.now();
      k.cooldownMs = cd;
    }
  });
  store[providerId] = list;
  writeRawStore(store);
}

/** Successful use rehabilitates the key and refreshes lastUsed. */
export function markKeyUsed(providerId: string, keyValue: string) {
  const store = readRawStore();
  const list = store[providerId] || [];
  list.forEach((k) => {
    if (deobfuscate(k.value) === keyValue) {
      k.lastUsed = Date.now();
      if (k.health === "unhealthy") k.health = "healthy";
      delete k.lastFailedAt;
      delete k.cooldownMs;
    }
  });
  store[providerId] = list;
  writeRawStore(store);
}

/* ------------------------------------------------------------------ */
/* Client-side RPM throttle                                            */
/* ------------------------------------------------------------------ */

const rpmWindows = new Map<string, number[]>();

/** Returns milliseconds to wait before the next call to this provider. */
export function rpmWaitMs(providerId: string, rpm: number): number {
  const now = Date.now();
  const windowMs = 60_000;
  const arr = (rpmWindows.get(providerId) || []).filter((t) => now - t < windowMs);
  const minInterval = 60_000 / Math.max(1, rpm);
  const last = arr.length ? arr[arr.length - 1] : 0;
  const spacingOk = now - last >= minInterval;
  if (!spacingOk) {
    rpmWindows.set(providerId, arr);
    return Math.max(1, minInterval - (now - last));
  }
  if (arr.length >= rpm) {
    rpmWindows.set(providerId, arr);
    return Math.max(1, arr[0] + windowMs - now);
  }
  arr.push(now);
  rpmWindows.set(providerId, arr);
  return 0;
}

/** True when an error message looks like a daily-quota exhaustion. */
export function isQuotaError(message: string): boolean {
  return /free_tier_requests|tokens.?per.?day|requests.?per.?day|rpd|tpd|exceeded.*quota|quota.*exceeded/i.test(
    message || ""
  );
}
