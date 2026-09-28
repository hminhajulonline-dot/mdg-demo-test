"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Dropzone from "@/components/generator/Dropzone";
import ResultCard, { formatFileSize, type CardItem } from "@/components/generator/ResultCard";
import ControlsPanel from "@/components/generator/ControlsPanel";
import ApiKeysModal from "@/components/generator/ApiKeysModal";
import SuccessModal from "@/components/generator/SuccessModal";
import FallbackToast from "@/components/generator/FallbackToast";
import { prepareImage, prepareVideoFrame } from "@/lib/client/image";
import { detectVector, prepareSvg, preparePostScript } from "@/lib/client/vector";
import { addToHistory } from "@/lib/client/history";
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
  markAllProviderKeysUnhealthy,
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
const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];
const VECTOR_EXT = ["svg", "ai", "eps", "pdf"];
const EXPORT_EXTS = ["", "eps", "ai", "svg", "jpg", "jpeg", "png", "psd"];

/** Parallel generation workers (CSV Tree runs ~3 concurrent items). */
const QUEUE_CONCURRENCY = 3;
/** Total passes per item: 1 initial + up to 2 auto-retries (CSV Tree MAX_PASSES). */
const MAX_PASSES = 3;

function isAccepted(file: File): boolean {
  if (RASTER_MIME.includes(file.type)) return true;
  if (VIDEO_MIME.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  if (VIDEO_EXT.some((ext) => name.endsWith(`.${ext}`))) return true;
  return VECTOR_EXT.some((ext) => name.endsWith(`.${ext}`));
}


function isVideoFile(file: File): boolean {
  if (VIDEO_MIME.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return VIDEO_EXT.some((ext) => name.endsWith(`.${ext}`));
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

/**
 * Rasterizes a vector file in the background right after upload so the card
 * shows artwork immediately instead of waiting for generation. Failures leave
 * the placeholder tile - generation will retry rasterization itself.
 */
function warmVectorPreview(
  setItems: (updater: (prev: WorkItem[]) => WorkItem[]) => void,
  id: string,
  fileUrl: string,
  filename: string
) {
  void (async () => {
    try {
      const kind = detectVector(filename);
      if (!kind) return;
      const blob = await fetch(fileUrl).then((r) => r.blob());
      let prep;
      if (kind === "svg") {
        prep = await prepareSvg(new File([blob], filename, { type: "image/svg+xml" }));
      } else {
        const lower = filename.toLowerCase();
        const ext = lower.endsWith(".eps") ? "eps" : lower.endsWith(".pdf") ? "pdf" : "ai";
        prep = await preparePostScript(
          new File([blob], filename, { type: "application/postscript" }),
          ext
        );
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === id && !it.prepBase64
            ? {
                ...it,
                previewUrl: `data:image/jpeg;base64,${prep.base64}`,
                prepBase64: prep.base64,
                prepMime: prep.mimeType,
              }
            : it
        )
      );
    } catch {
      // Keep the placeholder; callGenerate will attempt rasterization again.
    }
  })();
}

interface WorkItem extends CardItem {
  previewUrl: string;
  /** Object URL of the ORIGINAL file - the raster/parse data source. */
  fileUrl: string;
  /** Original file type from disk (before canvas compression). */
  fileType: string;
  /** Original file size in bytes (shown on the card). */
  fileSize: number;
  /** Is this a video file (preview shows <video>, AI gets a frame). */
  isVideo?: boolean;
  /** Cached vector rasterization from the upload-time preview pass. */
  prepBase64?: string;
  prepMime?: string;
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


  const [items, setItems] = useState<WorkItem[]>([]);
  const [running, setRunning] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ done: 0, total: 0, success: 0, failed: 0 });
  const [etaSec, setEtaSec] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const idCounter = useRef(0);
  const abortRef = useRef({ aborted: false });
  /** Failed-pass count per item id (drives the 3-pass auto-retry). */
  const retryCountRef = useRef<Map<string, number>>(new Map());
  const batchStartRef = useRef(0);

  // Live ETA + elapsed ticker while a batch runs.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (batchStartRef.current) {
        const elapsedMs = nowMs() - batchStartRef.current;
        setElapsedSec(Math.round(elapsedMs / 1000));
        if (stats.done > 0 && stats.total > stats.done) {
          const perDoneMs = elapsedMs / stats.done;
          setEtaSec(Math.round((perDoneMs / 1000) * (stats.total - stats.done)));
        }
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
  const totalBytes = useMemo(() => items.reduce((a, i) => a + (i.fileSize || 0), 0), [items]);
  const errorCount = useMemo(() => items.filter((i) => i.status === "error").length, [items]);
  const canExport =
    doneItems.length > 0 || items.some((i) => i.mode === "img2prompt" && i.promptText);

  /* ---------------------------------------------------------------- */
  /* File intake                                                        */
  /* ---------------------------------------------------------------- */

  const addFiles = useCallback(
    (files: File[]) => {
      const mode = getUserSettings().mode;
      const supported = files.filter((f) => isAccepted(f));
      const rejected = files.length - supported.length;
      const capacity = settings.max_images_per_batch - items.length;
      const slice = supported.slice(0, Math.max(0, capacity));
      const overflow = supported.length - slice.length;

      // CSV Tree toasts on every intake failure instead of silently dropping.
      if (rejected > 0 || overflow > 0) {
        const parts: string[] = [];
        if (rejected > 0)
          parts.push(`${rejected} unsupported file${rejected > 1 ? "s" : ""} skipped`);
        if (overflow > 0)
          parts.push(
            `Batch limit reached (${settings.max_images_per_batch}) - ${overflow} not added`
          );
        setFallbackMsg(parts.join(" - "));
      }
      if (slice.length === 0) return;

      const built: WorkItem[] = slice.map((file) => {
        const fileUrl = URL.createObjectURL(file);
        const vector = detectVector(file.name) !== null;
        return {
          id: `img_${nowMs()}_${idCounter.current++}`,
          filename: file.name,
          mode,
          status: "pending" as const,
          title: "",
          description: "",
          keywords: [],
          category: "",
          promptText: undefined,
          // Vectors have no native browser preview - placeholder tile while
          // warmVectorPreview rasterizes them in the background.
          previewUrl: vector ? "" : fileUrl,
          fileUrl,
          fileType: file.type || file.name.slice(file.name.lastIndexOf(".") + 1),
          fileSize: file.size,
          isVideo: isVideoFile(file) || undefined,
        };
      });

      setItems((prev) => [...prev, ...built]);

      // Instant vector previews: rasterize right after upload.
      for (const it of built) {
        if (!it.previewUrl) warmVectorPreview(setItems, it.id, it.fileUrl, it.filename);
      }
    },
    [items.length, settings.max_images_per_batch]
  );

  function updateItem(id: string, patch: Partial<WorkItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.fileUrl) URL.revokeObjectURL(target.fileUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    if (running) return;
    // Release object URLs so large batches don't pin memory.
    for (const it of items) {
      try {
        URL.revokeObjectURL(it.fileUrl);
      } catch {}
    }
    setItems([]);
    setStats({ done: 0, total: 0, success: 0, failed: 0 });
    setShowSuccess(false);
    retryCountRef.current.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Generation engine - BYOK attempt plan + auto-fallback              */
  /* ---------------------------------------------------------------- */

  async function callGenerate(item: WorkItem): Promise<void> {
    updateItem(item.id, { status: "processing", error: undefined });

    // Vectors (SVG/AI/EPS/PDF) are rasterized locally; rasters downscaled;
    // videos reduced to a representative frame. The rendered artwork becomes
    // the card preview immediately.
    let prepared;
    const vectorKind = detectVector(item.filename);
    if (item.prepBase64) {
      // Upload-time preview pass already rasterized this vector - reuse it.
      prepared = { base64: item.prepBase64, mimeType: item.prepMime || "image/jpeg" };
      updateItem(item.id, {
        previewUrl: `data:image/jpeg;base64,${prepared.base64}`,
      });
    } else if (vectorKind === "postscript") {
      const blob = await fetch(item.fileUrl).then((r) => r.blob());
      const ext = item.filename.toLowerCase().endsWith(".eps")
        ? "eps"
        : item.filename.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : "ai";
      prepared = await preparePostScript(
        new File([blob], item.filename, { type: "application/postscript" }),
        ext
      );
      updateItem(item.id, {
        previewUrl: `data:image/jpeg;base64,${prepared.base64}`,
      });
    } else if (vectorKind === "svg") {
      const blob = await fetch(item.fileUrl).then((r) => r.blob());
      prepared = await prepareSvg(
        new File([blob], item.filename, { type: "image/svg+xml" })
      );
      updateItem(item.id, {
        previewUrl: `data:image/jpeg;base64,${prepared.base64}`,
      });
    } else if (item.isVideo) {
      const blob = await fetch(item.fileUrl).then((r) => r.blob());
      prepared = await prepareVideoFrame(
        new File([blob], item.filename, { type: blob.type || "video/mp4" })
      );
    } else {
      const blob = await fetch(item.fileUrl).then((r) => r.blob());
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
            categories: meta.categories,
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
          if (isQuotaError(lastError) && /day|daily|per.?day/i.test(lastError)) {
            // Daily quota - every key of this provider is dead until rehab.
            markAllProviderKeysUnhealthy(attempt.providerId);
          } else {
            markKeyUnhealthy(
              attempt.providerId,
              attempt.keyValue,
              isQuotaError(lastError) ? QUOTA_REHAB_MS : undefined
            );
          }
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

    // Parallel worker pool - ~3x faster than sequential batches.
    const ids = [...pendingIds];
    const failedIds: string[] = [];
    let cursor = 0;
    let anySuccess = false;

    async function worker() {
      while (cursor < ids.length && !abortRef.current.aborted) {
        const id = ids[cursor++];
        const item = await new Promise<WorkItem | undefined>((resolve) =>
          setItems((prev) => {
            resolve(prev.find((i) => i.id === id));
            return prev;
          })
        );
        if (!item) continue;
        let ok = false;
        try {
          await callGenerate(item);
          ok = true;
          anySuccess = true;
        } catch (err) {
          failedIds.push(id);
          retryCountRef.current.set(id, (retryCountRef.current.get(id) ?? 0) + 1);
          updateItem(id, {
            status: "error",
            error: err instanceof Error ? err.message : "Generation failed.",
          });
        }
        // Closure-free counters: increment the bucket against live state so
        // parallel workers (and retries) never double-count.
        setStats((s) => ({
          ...s,
          done: s.done + 1,
          success: s.success + (ok ? 1 : 0),
          failed: s.failed + (ok ? 0 : 1),
        }));
      }
    }

    const workerCount = Math.min(QUEUE_CONCURRENCY, ids.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Auto-retry failed items up to MAX_PASSES total passes (CSV Tree).
    if (!abortRef.current.aborted) {
      const failedNow = failedIds.filter(
        (id) => (retryCountRef.current.get(id) ?? 0) < MAX_PASSES
      );
      if (failedNow.length > 0) {
        setFallbackMsg(
          `Retrying ${failedNow.length} failed file${failedNow.length > 1 ? "s" : ""} (attempt ${
            Math.min(...failedNow.map((id) => retryCountRef.current.get(id) ?? 1) ) + 1
          }/${MAX_PASSES})...`
        );
        for (const f of failedNow) {
          updateItem(f, { status: "pending", error: undefined });
          // Return the failed item to "not done yet" before the retry pass.
          setStats((s) => ({
            ...s,
            done: Math.max(0, s.done - 1),
            failed: Math.max(0, s.failed - 1),
          }));
        }
        setRunning(false);
        setTimeout(() => void runQueue(failedNow), 500);
        return;
      }
    }

    setRunning(false);
    if (!abortRef.current.aborted && anySuccess) {
      setShowSuccess(true);
    }
  }

  function generateAll() {
    if (running) return;
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0) return;
    batchStartRef.current = nowMs();
    setEtaSec(0);
    setElapsedSec(0);
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
    setFallbackMsg("Stopped. Partial results kept.");
  }

  /** Manual bulk retry of every failed card (independent of auto-retry). */
  function retryFailed() {
    if (running) return;
    const failed = items.filter((i) => i.status === "error");
    if (failed.length === 0) return;
    for (const f of failed) updateItem(f.id, { status: "pending", error: undefined });
    batchStartRef.current = nowMs();
    setEtaSec(0);
    setElapsedSec(0);
    setStats({ done: 0, total: failed.length, success: 0, failed: 0 });
    setShowSuccess(false);
    void runQueue(failed.map((f) => f.id));
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
      categories: i.categories,
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
              Admin-only. Images are processed in memory and never stored.
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
            {!running && errorCount > 0 ? (
              <button
                onClick={retryFailed}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Retry Failed ({errorCount})
              </button>
            ) : null}
            <button
              onClick={clearAll}
              disabled={running || items.length === 0}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Clear All
            </button>
            {items.length > 0 ? (
              <span className="text-xs font-medium text-slate-400">
                Total: {formatFileSize(totalBytes)}
              </span>
            ) : null}
            {running ? (
              <span className="ml-auto text-xs font-medium text-slate-500 tabular-nums">
                {stats.done}/{stats.total} done · {elapsedSec}s elapsed
                {stats.done > 0 ? ` · ${(elapsedSec / stats.done).toFixed(1)}s/file` : ""}
                {etaSec > 0 ? ` · ~${etaSec}s left` : ""}
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
                  isAIGenerated={user.isAIGenerated}
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
