"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Dropzone from "@/components/generator/Dropzone";
import ResultCard, { type CardItem } from "@/components/generator/ResultCard";
import ControlsPanel from "@/components/generator/ControlsPanel";
import ApiKeysModal from "@/components/generator/ApiKeysModal";
import SuccessModal from "@/components/generator/SuccessModal";
import FallbackToast from "@/components/generator/FallbackToast";
import { prepareImage } from "@/lib/client/image";
import { detectVector, prepareSvg, preparePostScript } from "@/lib/client/vector";
import {
  addToHistory,
  clearHistory,
  formatTime,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  subscribeHistory,
} from "@/lib/client/history";
import {
  getUserSettings,
  getServerUserSettings,
  setUserSettings,
  subscribeUserSettings,
  getExportExt,
  setExportExt as persistExportExt,
  getServerExportExt,
  getPlatform,
  getServerPlatform,
  setPlatform,
} from "@/lib/client/userSettings";
import {
  buildAttemptPlan,
  markKeyUsed,
  markKeyUnhealthy,
  rpmWaitMs,
  isQuotaError,
  getSelectedProvider,
  subscribeKeys,
  QUOTA_REHAB_MS,
} from "@/lib/client/apiKeys";
import { getProvider, PROVIDERS } from "@/lib/ai/providers";
import { buildCSV, buildPromptTxt, buildPromptCsv, type CsvRow } from "@/lib/csv/formats";
import type { GeneratorSettings, GeneratorUserSettings, GeneratedMetadata } from "@/lib/types";

const RASTER_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const VECTOR_EXT = ["svg", "ai", "eps", "pdf"];
const EXPORT_EXTS = ["", "eps", "ai", "svg", "jpg", "jpeg", "png", "psd"];

function isAccepted(file: File): boolean {
  if (RASTER_MIME.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return VECTOR_EXT.some((ext) => name.endsWith(`.${ext}`));
}

function isPostscript(file: File): boolean {
  const name = file.name.toLowerCase();
  return [".ai", ".eps", ".pdf"].some((ext) => name.endsWith(ext));
}

/** Module-scope clock read (keeps component render pure). */
function nowMs(): number {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function providerDisplayName(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

interface WorkItem extends CardItem {
  previewUrl: string;
  /** Original file type from disk (before canvas compression). */
  fileType: string;
}

interface Stats {
  done: number;
  total: number;
  success: number;
  failed: number;
}

export default function GeneratorWorkbench({
  settings,
  enabledProviders,
}: {
  settings: GeneratorSettings;
  enabledProviders: string[];
}) {
  const user = useSyncExternalStore(subscribeUserSettings, getUserSettings, getServerUserSettings);
  const platform = useSyncExternalStore(subscribeUserSettings, getPlatform, getServerPlatform);
  const exportExt = useSyncExternalStore(subscribeUserSettings, getExportExt, getServerExportExt);
  const providerName = useSyncExternalStore(
    (cb) => subscribeKeys(cb),
    getSelectedProvider,
    () => ""
  );
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot
  );

  const [items, setItems] = useState<WorkItem[]>([]);
  const [running, setRunning] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ done: 0, total: 0, success: 0, failed: 0 });
  const [etaSec, setEtaSec] = useState(0);
  const idCounter = useRef(0);
  const abortRef = useRef({ aborted: false });
  const retriedRef = useRef<Set<string>>(new Set());
  const batchStartRef = useRef(0);

  // Live ETA ticker while a batch runs.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (batchStartRef.current && stats.done > 0 && stats.total > stats.done) {
        const perDoneMs = (nowMs() - batchStartRef.current) / stats.done;
        setEtaSec(Math.round((perDoneMs / 1000) * (stats.total - stats.done)));
      }
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, stats.done, stats.total]);

  // Deep-links: ?mode=img2prompt and ?keys=1 (once per mount).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const m = params.get("mode");
        if (m === "img2prompt" && getUserSettings().mode !== "img2prompt") {
          setUserSettings({ mode: "img2prompt" });
        }
        if (params.get("keys") === "1") setShowApiKeys(true);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function update<K extends keyof GeneratorUserSettings>(
    key: K,
    value: GeneratorUserSettings[K]
  ) {
    setUserSettings({ [key]: value } as Partial<GeneratorUserSettings>);
  }

  const doneItems = useMemo(() => items.filter((i) => i.status === "done"), [items]);
  const canExport =
    doneItems.length > 0 || items.some((i) => i.mode === "img2prompt" && i.promptText);

  /* ---------------------------------------------------------------- */
  /* File intake                                                        */
  /* ---------------------------------------------------------------- */

  const addFiles = useCallback(
    (files: File[]) => {
      setItems((prev) => {
        const capacity = settings.max_images_per_batch - prev.length;
        if (capacity <= 0) return prev;
        const accepted = files
          .filter((f) => isAccepted(f))
          .slice(0, capacity);
        const mode = getUserSettings().mode;
        return [
          ...prev,
          ...accepted.map((file) => ({
            id: `img_${nowMs()}_${idCounter.current++}`,
            filename: file.name,
            mode,
            status: "pending" as const,
            title: "",
            description: "",
            keywords: [],
            category: "",
            promptText: undefined,
            // AI/EPS/PDF have no native browser preview - show a placeholder.
            previewUrl: isPostscript(file) ? "" : URL.createObjectURL(file),
            fileType: file.type || file.name.slice(file.name.lastIndexOf(".") + 1),
          })),
        ];
      });
    },
    [settings.max_images_per_batch]
  );

  function updateItem(id: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    if (running) return;
    setItems([]);
    setStats({ done: 0, total: 0, success: 0, failed: 0 });
    setShowSuccess(false);
    retriedRef.current.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Generation engine - BYOK attempt plan + auto-fallback              */
  /* ---------------------------------------------------------------- */

  async function callGenerate(item: WorkItem): Promise<void> {
    updateItem(item.id, { status: "processing", error: undefined });

    // Vectors (SVG/AI/EPS/PDF) are rasterized locally; rasters downscaled.
    let prepared;
    const vectorKind = detectVector(item.filename);
    if (vectorKind === "svg") {
      const blob = await fetch(item.previewUrl).then((r) => r.blob());
      prepared = await prepareSvg(
        new File([blob], item.filename, { type: "image/svg+xml" })
      );
    } else if (vectorKind === "postscript") {
      const blob = await fetch(item.previewUrl).then((r) => r.blob());
      prepared = await preparePostScript(
        new File([blob], item.filename, { type: "application/postscript" })
      );
    } else {
      const blob = await fetch(item.previewUrl).then((r) => r.blob());
      prepared = await prepareImage(
        new File([blob], item.filename, { type: blob.type || "image/jpeg" })
      );
    }
    const attempts = buildAttemptPlan().filter((a) =>
      enabledProviders.includes(a.providerId)
    );
    const payloadBase = {
      filename: item.filename,
      mimeType: prepared.mimeType,
      imageBase64: prepared.base64,
      // Original on-disk type: PNGs keep their transparent-background
      // phrasing even after canvas compression to JPEG.
      pngSource: item.fileType === "image/png",
      vectorKind: vectorKind ?? "",
      platform,
      options: {
        ...user,
        // Per-item mode so a mixed queue never mis-parses responses.
        mode: item.mode,
        prefix: user.usePrefix ? user.prefix : "",
        suffix: user.useSuffix ? user.suffix : "",
        negativeTitleWords: user.useNegativeTitle ? user.negativeTitleWords : "",
        negativeKeywords: user.useNegativeKeywords ? user.negativeKeywords : "",
        negativePromptWords: user.useNegativePrompt ? user.negativePromptWords : "",
        customPrompt: user.useCustomPrompt ? user.customPrompt : "",
        prohibitedWords: user.useProhibitedWords ? user.prohibitedWords : "",
      },
    };

    type Attempt = { providerId: string; keyValue: string } | null;
    const queue: Attempt[] =
      attempts.length > 0
        ? attempts.map((a) => ({ providerId: a.providerId, keyValue: a.keyValue }))
        : [null]; // null = server env key

    let lastError = "Generation failed.";
    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current.aborted) throw new Error("Aborted.");
      const attempt = queue[i];

      if (attempt) {
        const def = getProvider(attempt.providerId);
        if (def) {
          const wait = rpmWaitMs(attempt.providerId, def.rpm);
          if (wait > 0) await sleep(wait);
        }
      }

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadBase,
            ...(attempt ? { provider: attempt.providerId, apiKey: attempt.keyValue } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);

        if (attempt) markKeyUsed(attempt.providerId, attempt.keyValue);

        if (item.mode === "img2prompt") {
          updateItem(item.id, {
            status: "done",
            promptText: typeof json.prompt === "string" ? json.prompt : "",
          });
        } else {
          const meta = (json.metadata ?? {}) as GeneratedMetadata;
          updateItem(item.id, {
            status: "done",
            title: meta.title ?? "",
            description: meta.description ?? "",
            keywords: Array.isArray(meta.keywords) ? meta.keywords : [],
            category: meta.category ?? "",
            prompt: meta.prompt,
            baseModel: meta.baseModel,
          });
        }

        addToHistory({
          id: item.id,
          filename: item.filename,
          title:
            item.mode === "img2prompt"
              ? ((json.prompt as string) ?? "")
              : ((json.metadata?.title as string) ?? ""),
          description:
            item.mode === "img2prompt" ? "" : ((json.metadata?.description as string) ?? ""),
          keywords:
            item.mode === "img2prompt"
              ? []
              : Array.isArray(json.metadata?.keywords)
                ? (json.metadata?.keywords as string[])
                : [],
          category: item.mode === "img2prompt" ? "" : ((json.metadata?.category as string) ?? ""),
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt) {
          markKeyUnhealthy(
            attempt.providerId,
            attempt.keyValue,
            isQuotaError(lastError) ? QUOTA_REHAB_MS : undefined
          );
          const nextName = queue[i + 1]
            ? providerDisplayName(queue[i + 1]!.providerId)
            : null;
          setFallbackMsg(
            nextName
              ? `${providerDisplayName(attempt.providerId)} failed - falling back to ${nextName}…`
              : `${providerDisplayName(attempt.providerId)} failed - no fallback keys left.`
          );
        }
        // Try the next key/provider automatically.
      }
    }
    throw new Error(lastError);
  }

  async function runQueue(pendingIds: string[]) {
    abortRef.current.aborted = false;
    setRunning(true);
    let success = stats.success;
    let failed = stats.failed;

    for (let n = 0; n < pendingIds.length; n++) {
      if (abortRef.current.aborted) break;
      const id = pendingIds[n];
      const item = await new Promise<WorkItem | undefined>((resolve) =>
        setItems((prev) => {
          resolve(prev.find((i) => i.id === id));
          return prev;
        })
      );
      if (!item) continue;
      try {
        await callGenerate(item);
        success++;
      } catch (err) {
        failed++;
        updateItem(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Generation failed.",
        });
      }
      setStats((s) => ({ ...s, done: s.done + 1, success, failed }));
    }

    // Auto-retry failed items once (CSV Tree behaviour).
    if (!abortRef.current.aborted) {
      const failedNow = items.filter(
        (i) => i.status === "error" && !retriedRef.current.has(i.id)
      );
      for (const f of failedNow) retriedRef.current.add(f.id);
      if (failedNow.length > 0) {
        for (const f of failedNow) {
          updateItem(f.id, { status: "pending", error: undefined });
          setStats((s) => ({ ...s, done: Math.max(0, s.done - 1) }));
        }
        setRunning(false);
        setTimeout(() => void runQueue(failedNow.map((f) => f.id)), 500);
        return;
      }
    }

    setRunning(false);
    if (!abortRef.current.aborted && success > 0) {
      setShowSuccess(true);
    }
  }

  function generateAll() {
    if (running) return;
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0) return;
    batchStartRef.current = nowMs();
    setStats({ done: 0, total: pending.length, success: 0, failed: 0 });
    setShowSuccess(false);
    void runQueue(pending.map((i) => i.id));
  }

  async function regenerate(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item || running) return;
    batchStartRef.current = nowMs();
    updateItem(id, { status: "pending", error: undefined });
    setStats({ done: 0, total: 1, success: 0, failed: 0 });
    await runQueue([id]);
  }

  function stop() {
    abortRef.current.aborted = true;
  }

  /* ---------------------------------------------------------------- */
  /* Export - metadata = CSV only, prompts = CSV + TXT                  */
  /* ---------------------------------------------------------------- */

  function exportRows(): CsvRow[] {
    if (user.mode === "img2prompt") {
      return items
        .filter((i) => i.promptText)
        .map((i) => ({ filename: i.filename, title: i.promptText }));
    }
    return doneItems.map((i) => ({
      filename: i.filename,
      title: i.title,
      description: i.description,
      keywords: i.keywords,
      category: i.category || "",
      prompt: i.prompt,
      baseModel: i.baseModel,
    }));
  }

  function download(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!canExport) return;
    const rows = exportRows();
    const suffix = exportExt ? `-${exportExt}` : "";
    download(
      buildCSV(platform, rows, { exportExt }),
      `${platform}-metadata${suffix}.csv`,
      "text/csv;charset=utf-8"
    );
  }

  function exportPromptsTxt() {
    if (!canExport) return;
    download(buildPromptTxt(exportRows()), "all-prompts.txt", "text/plain;charset=utf-8");
  }

  function exportPromptsCsv() {
    if (!canExport) return;
    download(buildPromptCsv(exportRows()), "all-prompts.csv", "text/csv;charset=utf-8");
  }

  const isPromptMode = user.mode === "img2prompt";

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <div className="lg:flex items-stretch w-full">
        {/* Sidebar - docked hard-left, full viewport height, own scroll */}
        <aside className="lg:w-[330px] lg:shrink-0 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface-dark/60 p-4 space-y-4">
          <div>
            <h1 className="text-lg font-bold">AI Metadata Generator</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              No account needed. Images stay in your browser.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-background dark:bg-background shadow-sm p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold">Controls</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {providerName ? `Provider: ${providerName}` : "No keys - using server AI"}
              </p>
            </div>
            <button
              onClick={() => setShowApiKeys(true)}
              className="shrink-0 inline-flex items-center rounded-full bg-brand px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:opacity-90 transition-opacity"
            >
              API Keys
            </button>
          </div>

          <ControlsPanel
            settings={user}
            update={update}
            platform={platform}
            setPlatform={(p) => setPlatform(p)}
          />
        </aside>

        {/* Main column - cards fill the remaining space */}
        <section className="flex-1 min-w-0 px-4 sm:px-6 py-6 space-y-5">
          {/* Toolbar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface shadow-sm p-3 flex flex-wrap items-center gap-2">
            <button
              onClick={generateAll}
              disabled={running || !items.some((i) => i.status === "pending")}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {running ? `Generating… (${stats.done}/${stats.total})` : "Generate All"}
            </button>
            {running ? (
              <button
                onClick={stop}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Stop
              </button>
            ) : null}
            <button
              onClick={clearAll}
              disabled={running || items.length === 0}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Clear All
            </button>
            {running && etaSec > 0 ? (
              <span className="ml-auto text-xs font-medium text-slate-500 tabular-nums">
                ~{etaSec}s remaining
              </span>
            ) : null}
            {!running && stats.total > 0 ? (
              <span className="ml-auto text-xs font-medium text-slate-500">
                {stats.success}/{stats.total} succeeded
                {stats.failed ? ` · ${stats.failed} failed` : ""}
              </span>
            ) : null}
          </div>

          {/* Dropzone */}
          <Dropzone onFiles={addFiles} disabled={running} maxFiles={settings.max_images_per_batch} />

          {items.length >= settings.max_images_per_batch && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Batch limit reached ({settings.max_images_per_batch} images). Raise it in Admin
              Panel → Generator Settings → Max Images / Batch.
            </p>
          )}

          {/* Results */}
          {items.length > 0 && (
            <div className="space-y-4">
              {items.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  platform={platform}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onRegenerate={() => regenerate(item.id)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          )}

          {/* Export bar */}
          {items.length > 0 ? (
            <div className="sticky bottom-4 z-30 rounded-xl border border-slate-200 dark:border-slate-800 bg-background/95 backdrop-blur shadow-lg p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                Export ({isPromptMode ? items.filter((i) => i.promptText).length : doneItems.length} ready):
              </span>
              <button
                onClick={exportCsv}
                disabled={!canExport}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Download CSV
              </button>
              {isPromptMode ? (
                <button
                  onClick={exportPromptsTxt}
                  disabled={!canExport}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  Prompts .TXT
                </button>
              ) : (
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 ml-auto">
                  Filename ext.
                  <select
                    value={exportExt}
                    onChange={(e) => persistExportExt(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/50"
                  >
                    {EXPORT_EXTS.map((e) => (
                      <option key={e || "orig"} value={e}>
                        {e || "original"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : null}

          {/* History */}
          {history.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface shadow-sm">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold"
              >
                Recent generations (stored locally in your browser)
                <span>{showHistory ? "▲" : "▼"}</span>
              </button>
              {showHistory && (
                <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {history.map((h) => (
                    <div key={`${h.savedAt}-${h.filename}`} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium truncate">{h.filename}</span>
                        <span className="text-xs text-slate-400 shrink-0">{formatTime(h.savedAt)}</span>
                      </div>
                      <p className="mt-1 text-slate-600 dark:text-slate-400 line-clamp-1">{h.title}</p>
                    </div>
                  ))}
                  <div className="px-4 py-2">
                    <button
                      onClick={() => clearHistory()}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Clear history
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <ApiKeysModal
        open={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        enabledProviders={enabledProviders}
      />

      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        count={isPromptMode ? items.filter((i) => i.promptText).length : doneItems.length}
        failedCount={stats.failed}
        mode={user.mode}
        onDownloadCsv={isPromptMode ? exportPromptsCsv : exportCsv}
        onDownloadTxt={isPromptMode ? exportPromptsTxt : undefined}
      />

      <FallbackToast message={fallbackMsg} onDone={() => setFallbackMsg(null)} />
    </>
  );
}
