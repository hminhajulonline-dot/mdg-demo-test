"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import ToolToast, { type ToolToastData } from "@/components/tools/ToolToast";
import { rasterizePostScriptToJpeg } from "@/lib/client/vector";

type Status = "pending" | "processing" | "done" | "error";

interface Entry {
  id: string;
  file: File;
  name: string;
  size: number;
  status: Status;
  blob: Blob | null;
  url: string | null;
  error: string | null;
}

const DPI = 150;
const QUALITY = 95;
const MAX_FILES = 100;

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const SPINNER = (
  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICONS = {
  upload: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
  fileImage:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  image: "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 12h.008v.008H18V12Zm-15 3.75V16.5A2.25 2.25 0 0 0 5.25 18.75h13.5A2.25 2.25 0 0 0 21 16.5v-1.5m-18 0V6A2.25 2.25 0 0 1 5.25 3.75h13.5A2.25 2.25 0 0 1 21 6v9.75m-18 0h18",
  download:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m.75 12 3 3m0 0 3-3m-3 3V16.5m0-12 3 3m0 0 3-3m-3 3v1.5",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.31 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  check: "M4.5 12.75l6 6 9-13.5",
  x: "M6 18L18 6M6 6l12 12",
  zoom:
    "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z",
  arrowLeft: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
  refresh:
    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99",
};

const ACCEPT = /\.(eps|ai|ps|pdf)$/i;

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function jpgName(name: string) {
  return name.replace(/\.[^.]+$/, ".jpg");
}

export default function EpsToJpgClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Entry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<Entry | null>(null);
  const [toast, setToast] = useState<ToolToastData | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const showToast = useCallback((msg: string, kind: ToolToastData["kind"] = "success") => {
    setToast({ msg, kind });
  }, []);

  const onPickFiles = useCallback(
    (list: FileList | null | undefined) => {
      const arr = Array.from(list || []);
      const eps = arr.filter((f) => ACCEPT.test(f.name));
      if (!eps.length) {
        showToast("Upload .eps, .ai, .ps or .pdf files", "error");
        return;
      }
      setFiles((prev) => {
        const next = [
          ...prev,
          ...eps.map((f) => ({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            file: f,
            name: f.name,
            size: f.size,
            status: "pending" as Status,
            blob: null,
            url: null,
            error: null,
          })),
        ];
        if (next.length > MAX_FILES) showToast(`Capped at ${MAX_FILES} files per session.`, "warn");
        return next.slice(0, MAX_FILES);
      });
    },
    [showToast]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.url) URL.revokeObjectURL(f.url);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    files.forEach((f) => {
      if (f.url) URL.revokeObjectURL(f.url);
    });
    setFiles([]);
  }, [files]);

  const convertAll = useCallback(async () => {
    const pending = files.filter((f) => f.status === "pending" || f.status === "error");
    if (!pending.length) {
      showToast("Nothing to convert.", "warn");
      return;
    }
    setProcessing(true);
    let done = 0;
    for (const entry of pending) {
      setFiles((prev) => prev.map((x) => (x.id === entry.id ? { ...x, status: "processing" } : x)));
      try {
        const blob = await rasterizePostScriptToJpeg(entry.file, { dpi: DPI, quality: QUALITY });
        const url = URL.createObjectURL(blob);
        setFiles((prev) =>
          prev.map((x) => (x.id === entry.id ? { ...x, status: "done", blob, url, error: null } : x))
        );
        done++;
      } catch (err) {
        setFiles((prev) =>
          prev.map((x) =>
            x.id === entry.id
              ? { ...x, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : x
          )
        );
      }
    }
    setProcessing(false);
    showToast(`Converted ${done}/${pending.length} files`, done > 0 ? "success" : "error");
  }, [files, showToast]);

  const downloadOne = useCallback(
    (entry: Entry) => {
      if (!entry.url) return;
      const a = document.createElement("a");
      a.href = entry.url;
      a.download = jpgName(entry.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    []
  );

  const downloadAll = useCallback(async () => {
    const done = files.filter((f) => f.status === "done" && f.blob);
    if (!done.length) {
      showToast("Nothing to download.", "warn");
      return;
    }
    const zip = new JSZip();
    done.forEach((f) => zip.file(jpgName(f.name), f.blob!));
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eps-to-jpg-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`ZIP downloaded (${done.length} files)`);
  }, [files, showToast]);

  const doneCount = files.filter((f) => f.status === "done").length;
  const pendingCount = files.filter((f) => f.status === "pending" || f.status === "error").length;
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <Link
        href="/tools"
        className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
      >
        <I d={ICONS.arrowLeft} className="h-3.5 w-3.5" /> All tools
      </Link>

      <header className="mb-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <I d={ICONS.fileImage} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">EPS/AI to JPG Converter</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Convert EPS, AI, PS and PDF vector files to crisp JPGs — entirely in your browser with
            Ghostscript WASM. Batch mode with ZIP download.
          </p>
        </div>
      </header>

      {/* Upload */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-surface p-5 dark:border-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <I d={ICONS.upload} className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold">Upload Files</h2>
        </div>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPickFiles(e.dataTransfer.files);
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? "border-brand bg-brand/5"
              : "border-slate-300 hover:border-brand dark:border-slate-700"
          }`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
            <I d={ICONS.fileImage} className="h-6 w-6 text-slate-400" />
          </div>
          <div className="mb-3 flex items-center justify-center gap-2">
            {["AI", "EPS", "PS", "PDF"].map((ext) => (
              <span
                key={ext}
                className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {ext}
              </span>
            ))}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Drag &amp; drop files, or <span className="text-brand underline">browse</span>
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Up to {MAX_FILES} files per session ({DPI} PPI JPG output)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".eps,.ai,.ps,.pdf"
          className="hidden"
          onChange={(e) => {
            onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Status bar */}
      {files.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-surface px-5 py-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {files.length} file{files.length !== 1 ? "s" : ""} · {fmtSize(totalSize)}
            </span>
            {doneCount > 0 ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <I d={ICONS.check} className="h-3 w-3" /> {doneCount} processed
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-red-500"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={convertAll}
              disabled={processing || !pendingCount}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? SPINNER : <I d={ICONS.image} className="h-3 w-3" />}
              Convert ({pendingCount})
            </button>
            {doneCount > 0 ? (
              <button
                type="button"
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <I d={ICONS.download} className="h-3 w-3" /> Download All (ZIP)
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Card grid */}
      {files.length > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-surface transition-colors hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
            >
              <div className="relative overflow-hidden bg-slate-100 dark:bg-slate-800/50">
                {entry.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.url} alt={entry.name} className="block w-full" />
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center">
                    <I d={ICONS.fileImage} className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
                {entry.url ? (
                  <button
                    type="button"
                    onClick={() => setPreview(entry)}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/30 group-hover:opacity-100"
                    title="Preview"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg dark:bg-slate-900/90">
                      <I d={ICONS.zoom} className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                    </span>
                  </button>
                ) : null}
                {entry.status === "done" ? (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-lg">
                    <I d={ICONS.check} className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : null}
                {entry.status === "processing" ? (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 shadow-lg">
                    {SPINNER}
                  </div>
                ) : null}
                {entry.status === "error" ? (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 shadow-lg">
                    <I d={ICONS.x} className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeFile(entry.id)}
                  className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  title="Remove"
                >
                  <I d={ICONS.trash} className="h-3 w-3" />
                </button>
              </div>
              <div className="p-3">
                <p className="mb-0.5 truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  {entry.name}
                </p>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{fmtSize(entry.size)}</span>
                  {entry.status === "done" ? (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Done
                    </span>
                  ) : entry.status === "processing" ? (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Converting…
                    </span>
                  ) : entry.status === "error" ? (
                    <span className="max-w-[80px] truncate text-[10px] font-medium text-red-500">
                      Failed
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Pending</span>
                  )}
                </div>
                {entry.status === "done" ? (
                  <button
                    type="button"
                    onClick={() => downloadOne(entry)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <I d={ICONS.download} className="h-3 w-3" /> Download JPG
                  </button>
                ) : entry.status === "processing" ? (
                  <div className="w-full rounded-lg bg-slate-50 py-1.5 text-center text-[11px] font-semibold text-slate-400 dark:bg-slate-800/50">
                    Processing…
                  </div>
                ) : entry.status === "error" ? (
                  <button
                    type="button"
                    onClick={convertAll}
                    className="w-full rounded-lg border border-red-200 bg-red-50 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    Retry
                  </button>
                ) : (
                  <div className="w-full rounded-lg bg-slate-50 py-1.5 text-center text-[11px] font-semibold text-slate-500 dark:bg-slate-800/30 dark:text-slate-600">
                    Pending
                  </div>
                )}
                {entry.status === "error" && entry.error ? (
                  <p
                    className="mt-1 line-clamp-2 text-[9px] leading-snug text-red-400"
                    title={entry.error}
                  >
                    {entry.error}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Preview modal */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg transition-colors hover:text-red-500 dark:bg-slate-800 dark:text-slate-300"
            >
              <I d={ICONS.x} className="h-4 w-4" />
            </button>
            {preview.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            ) : null}
            <div className="mt-3 text-center text-xs text-slate-300">{preview.name}</div>
          </div>
        </div>
      ) : null}

      <ToolToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
