"use client";

/**
 * Client-side attempt loop for the tools' text/vision AI passes - the same
 * rotation engine the generator workbench uses, minus the store-specific
 * bookkeeping: try stored BYOK keys first (selected provider, then fallback
 * providers), finally the server env key.
 */

import {
  buildAttemptPlan,
  markAllProviderKeysUnhealthy,
  markKeyUnhealthy,
  markKeyUsed,
  isQuotaError,
  rpmWaitMs,
} from "@/lib/client/apiKeys";
import { getProvider } from "@/lib/ai/providers";

export interface TextAiOptions {
  imageBase64?: string;
  mimeType?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Called when a successful attempt landed on a different provider. */
  onFallback?: (from: string, to: string, reason: string) => void;
  /** Human-readable progress line ("Trying Groq…", "Waiting for rate limit…"). */
  onStatus?: (message: string) => void;
  isCancelled?: () => boolean;
}

export interface TextAiResult {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTextAi(
  instruction: string,
  opts: TextAiOptions = {}
): Promise<TextAiResult> {
  const attempts = [
    ...buildAttemptPlan(),
    { providerId: "", keyValue: "" }, // server env fallback
  ];

  const errors: string[] = [];
  let prevLabel = "";
  let prevReason = "";

  for (const attempt of attempts) {
    if (opts.isCancelled?.()) throw new Error("Cancelled.");

    const { providerId, keyValue } = attempt;
    const isClientKey = Boolean(providerId && keyValue);
    const label = isClientKey
      ? getProvider(providerId)?.name || providerId
      : "server key";

    if (isClientKey) {
      const def = getProvider(providerId);
      if (def) {
        const wait = rpmWaitMs(def.id, def.rpm);
        if (wait > 0) {
          opts.onStatus?.(`Rate limit: waiting ${Math.ceil(wait / 1000)}s…`);
          await sleep(wait);
        }
      }
      opts.onStatus?.(`Trying ${label}…`);
    } else {
      opts.onStatus?.("Trying server key…");
    }

    try {
      const res = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          imageBase64: opts.imageBase64,
          mimeType: opts.mimeType,
          provider: isClientKey ? providerId : undefined,
          apiKey: isClientKey ? keyValue : undefined,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          jsonMode: opts.jsonMode === true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        text?: string;
        provider?: string;
        model?: string;
        durationMs?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      if (isClientKey) markKeyUsed(providerId, keyValue);
      if (prevLabel && prevLabel !== label) {
        opts.onFallback?.(prevLabel, label, prevReason);
      }
      return {
        text: json.text || "",
        provider: json.provider || (isClientKey ? providerId : "env"),
        model: json.model || "",
        durationMs: json.durationMs ?? 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      prevLabel = label;
      prevReason = msg;
      if (isClientKey) {
        if (isQuotaError(msg)) markAllProviderKeysUnhealthy(providerId);
        else markKeyUnhealthy(providerId, keyValue);
      }
      errors.push(msg);
    }
  }

  throw new Error(
    errors.length ? errors[errors.length - 1] : "AI request failed."
  );
}
