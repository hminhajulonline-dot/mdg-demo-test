"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolToast, { type ToolToastData } from "@/components/tools/ToolToast";

// Three modes, all browser-side:
//   image -> image  (PNG / JPG / WebP / BMP via Canvas + toBlob)
//   images -> PDF   (multi-image merge, pdf-lib)
//   PDF -> images   (per-page render via pdfjs-dist)
// Heavy deps (pdf-lib, pdfjs-dist) are dynamically imported on first use.

type Mode = "img2img" | "img2pdf" | "pdf2img";
type ToolTab = "converter" | "compressor";
type ItemStatus = "queued" | "processing" | "done" | "failed";

interface PageOut {
  index: number;
  blob: Blob;
  ext: string;
  url: string;
}

interface Item {
  id: string;
  file: File;
  status: ItemStatus;
  previewUrl: string | null;
  resultUrl: string | null;
  resultExt: string | null;
  resultSize: number | null;
  pages: PageOut[] | null;
  error: string;
}

interface CompItem {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  quality: number;
  status: ItemStatus;
  resultBlob: Blob | null;
}

interface ModeDef {
  id: Mode;
  label: string;
  blurb: string;
  accept: string;
  icon: string;
}

const MODES: ModeDef[] = [
  {
    id: "img2img",
    label: "Image → Image",
    blurb: "Convert PNG, JPG, JPEG, WebP, BMP between formats.",
    accept: "image/png,image/jpeg,image/webp,image/bmp,image/gif",
    icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 12h.008v.008H18V12Zm-15 3.75V16.5A2.25 2.25 0 0 0 5.25 18.75h13.5A2.25 2.25 0 0 0 21 16.5v-1.5m-18 0V6A2.25 2.25 0 0 1 5.25 3.75h13.5A2.25 2.25 0 0 1 21 6v9.75m-18 0h18",
  },
  {
    id: "img2pdf",
    label: "Images → PDF",
    blurb: "Merge multiple images into one combined PDF document.",
    accept: "image/png,image/jpeg,image/webp",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  },
  {
    id: "pdf2img",
    label: "PDF → Images",
    blurb: "Split each PDF page into a separate PNG or JPG.",
    accept: "application/pdf",
    icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5M15.75 9v-.75A2.25 2.25 0 0 0 13.5 6h-3a2.25 2.25 0 0 0-2.25 2.25v.75",
  },
];

const IMG_FORMATS = [
  { id: "png", ext: "png", mime: "image/png", label: "PNG", blurb: "Lossless · keeps transparency", alpha: true },
  { id: "jpg", ext: "jpg", mime: "image/jpeg", label: "JPG", blurb: "Smallest · stock-friendly", alpha: false },
  { id: "jpeg", ext: "jpeg", mime: "image/jpeg", label: "JPEG", blurb: "Same as JPG (just .jpeg)", alpha: false },
  { id: "webp", ext: "webp", mime: "image/webp", label: "WebP", blurb: "Modern · ~30% smaller", alpha: true },
  { id: "bmp", ext: "bmp", mime: "image/bmp", label: "BMP", blurb: "Uncompressed bitmap", alpha: false },
];

const PAGE_SIZES = [
  { id: "a4", label: "A4", w: 595, h: 842 },
  { id: "letter", label: "US Letter", w: 612, h: 792 },
  { id: "legal", label: "US Legal", w: 612, h: 1008 },
  { id: "a3", label: "A3", w: 842, h: 1191 },
  { id: "a5", label: "A5", w: 420, h: 595 },
  { id: "square", label: "Square (1:1)", w: 595, h: 595 },
  { id: "auto", label: "Auto (image size)", w: 0, h: 0 },
];

const FIT_MODES = [
  { id: "contain", label: "Contain", blurb: "Whole image fits the page (may add margins)." },
  { id: "cover", label: "Cover", blurb: "Image fills the page (may crop edges)." },
  { id: "stretch", label: "Stretch", blurb: "Squish image to fit page exactly." },
];

const PDF_RENDER_DPI = [
  { id: 72, label: "72 dpi", blurb: "Web · smallest" },
  { id: 150, label: "150 dpi", blurb: "Print · balanced" },
  { id: 300, label: "300 dpi", blurb: "Stock · sharpest" },
];

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 100;

const I = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const SPINNER = (
  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const ICONS = {
  upload: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
  link: "M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m11.257-4.5a4.5 4.5 0 0 0-6.364 0l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244",
  fileText:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  imageDown:
    "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5m4.5-9 3 3m0 0 3-3m-3 3v1.5",
  layers: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  download:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m.75 12 3 3m0 0 3-3m-3 3V16.5m0-12 3 3m0 0 3-3m-3 3v1.5",
  x: "M6 18L18 6M6 6l12 12",
  plus: "M12 4.5v15m7.5-7.5h-15",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.31 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  min: "M7.5 3.75h9M3.75 12h16.5M12 3.75v16.5",
  arrowLeft: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}

async function fileToImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return { img, url };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), mime, quality);
  });
}

/* ------------------------------------------------------------------ */
/* Image -> Image                                                      */
/* ------------------------------------------------------------------ */

async function convertImage(file: File, format: string, qualityPct: number) {
  const fmt = IMG_FORMATS.find((f) => f.id === format) || IMG_FORMATS[0];
  const { img, url } = await fileToImage(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    if (!fmt.alpha) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const quality = Math.max(0.4, Math.min(1, qualityPct / 100));
    const blob = await canvasToBlob(canvas, fmt.mime, quality);
    return { blob, ext: fmt.ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ */
/* Images -> PDF                                                       */
/* ------------------------------------------------------------------ */

async function imagesToPdf(
  files: File[],
  opts: { pageSize: string; orientation: string; fit: string; marginPct: number }
): Promise<Blob> {
  const { pageSize, orientation, fit, marginPct } = opts;
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();

  for (const file of files) {
    const buf = await file.arrayBuffer();
    let embedded;
    if (/^image\/png$/i.test(file.type)) {
      embedded = await pdf.embedPng(buf);
    } else if (/^image\/jpe?g$/i.test(file.type)) {
      embedded = await pdf.embedJpg(buf);
    } else {
      const { img, url } = await fileToImage(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported.");
        ctx.drawImage(img, 0, 0);
        const blob = await canvasToBlob(canvas, "image/png", 1);
        const reBuf = await blob.arrayBuffer();
        embedded = await pdf.embedPng(reBuf);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const sizeDef = PAGE_SIZES.find((p) => p.id === pageSize) || PAGE_SIZES[0];
    let pageW = sizeDef.w;
    let pageH = sizeDef.h;
    if (sizeDef.id === "auto") {
      pageW = embedded.width;
      pageH = embedded.height;
    } else if (orientation === "landscape" && pageW < pageH) {
      [pageW, pageH] = [pageH, pageW];
    } else if (orientation === "portrait" && pageW > pageH) {
      [pageW, pageH] = [pageH, pageW];
    }

    const page = pdf.addPage([pageW, pageH]);
    const margin = (Math.max(0, Math.min(20, Number(marginPct) || 0)) / 100) * Math.min(pageW, pageH);
    const innerW = Math.max(1, pageW - margin * 2);
    const innerH = Math.max(1, pageH - margin * 2);

    let drawW = innerW;
    let drawH = innerH;
    if (fit === "contain") {
      const scale = Math.min(innerW / embedded.width, innerH / embedded.height);
      drawW = embedded.width * scale;
      drawH = embedded.height * scale;
    } else if (fit === "cover") {
      const scale = Math.max(innerW / embedded.width, innerH / embedded.height);
      drawW = embedded.width * scale;
      drawH = embedded.height * scale;
    }

    const x = margin + (innerW - drawW) / 2;
    const y = margin + (innerH - drawH) / 2;
    page.drawImage(embedded, { x, y, width: drawW, height: drawH });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ */
/* PDF -> Images                                                       */
/* ------------------------------------------------------------------ */

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfJs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((lib) => {
      const setWorker = (src: string) => {
        lib.GlobalWorkerOptions.workerSrc = src;
      };
      setWorker("/pdf.worker.min.mjs");
      return lib;
    });
  }
  return pdfjsPromise;
}

async function pdfToImages(
  file: File,
  opts: { format: string; qualityPct: number; dpi: number }
): Promise<PageOut[]> {
  const { format, qualityPct, dpi } = opts;
  const fmt = IMG_FORMATS.find((f) => f.id === format) || IMG_FORMATS[0];
  const lib = await getPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buf, verbosity: 0 } as Parameters<typeof lib.getDocument>[0])
    .promise;
  const pages: PageOut[] = [];
  const scale = (Number(dpi) || 150) / 72;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    if (!fmt.alpha) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const quality = Math.max(0.4, Math.min(1, qualityPct / 100));
    const blob = await canvasToBlob(canvas, fmt.mime, quality);
    pages.push({ index: i, blob, ext: fmt.ext, url: "" });
  }
  await doc.cleanup();
  return pages;
}

/* ------------------------------------------------------------------ */
/* Compressor                                                          */
/* ------------------------------------------------------------------ */

function compressImage(file: File, qualityPct: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported.");
        ctx.drawImage(img, 0, 0);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const q = Math.max(0.01, Math.min(1, qualityPct / 100));
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("Compression failed."));
        }, mime, q);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
    img.src = url;
  });
}

function formatPct(saved: number) {
  if (saved <= 0) return "0%";
  return `-${Math.round(saved)}%`;
}

function statusBadge(status: ItemStatus) {
  switch (status) {
    case "queued":
      return { text: "Queued", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
    case "processing":
      return { text: "Working", cls: "bg-brand/10 text-brand dark:bg-brand/20" };
    case "done":
      return { text: "Done", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    case "failed":
      return { text: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    default:
      return { text: status, cls: "bg-slate-100 text-slate-600 dark:bg-slate-800" };
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ------------------------------------------------------------------ */
/* Compressor card                                                     */
/* ------------------------------------------------------------------ */

function CompressorCard({
  item,
  onQualityChange,
  onRemove,
}: {
  item: CompItem;
  onQualityChange: (id: string, q: number) => void;
  onRemove: (id: string) => void;
}) {
  const saved =
    item.originalSize > 0 ? (1 - (item.compressedSize || 0) / item.originalSize) * 100 : 0;
  const isSmaller = item.compressedSize && item.compressedSize < item.originalSize;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
        {item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <I d={ICONS.imageDown} className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{item.file.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{formatBytes(item.originalSize)}</span>
          {item.status === "done" ? (
            <>
              <span className="text-[10px] text-slate-400">→</span>
              <span
                className={`text-[10px] font-bold ${isSmaller ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
              >
                {formatBytes(item.compressedSize)}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isSmaller ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
              >
                {formatPct(saved)}
              </span>
            </>
          ) : null}
          {item.status === "processing" ? SPINNER : null}
          {item.status === "failed" ? (
            <span className="text-[10px] text-red-500">Failed</span>
          ) : null}
        </div>
        {item.status === "done" ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-8 text-[9px] text-slate-400">Q:</span>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={item.quality}
              onChange={(e) => onQualityChange(item.id, Number(e.target.value))}
              className="h-1 flex-1 accent-brand"
            />
            <span className="w-8 text-right text-[10px] font-bold text-slate-500">
              {item.quality}%
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {item.status === "done" && item.resultBlob ? (
          <button
            type="button"
            onClick={() =>
              downloadBlob(item.resultBlob!, `compressed-${item.file.name || "image"}`)
            }
            className="rounded-lg bg-emerald-500 p-1.5 text-white transition-colors hover:bg-emerald-600"
            title="Download"
          >
            <I d={ICONS.download} className="h-3 w-3" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-lg bg-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-500 dark:bg-slate-700"
          title="Remove"
        >
          <I d={ICONS.x} className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main converter                                                      */
/* ------------------------------------------------------------------ */

export default function ConverterClient() {
  const [toolTab, setToolTab] = useState<ToolTab>("converter");
  const [mode, setMode] = useState<Mode>("img2img");
  const modeDef = useMemo(() => MODES.find((m) => m.id === mode) || MODES[0], [mode]);

  const [items, setItems] = useState<Item[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // img2img settings
  const [imgFormat, setImgFormat] = useState("png");
  const [imgQuality, setImgQuality] = useState(92);

  // img2pdf settings
  const [pdfPageSize, setPdfPageSize] = useState("a4");
  const [pdfOrientation, setPdfOrientation] = useState("portrait");
  const [pdfFit, setPdfFit] = useState("contain");
  const [pdfMargin, setPdfMargin] = useState(5);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlobSize, setPdfBlobSize] = useState(0);

  // pdf2img settings
  const [pdfImgFormat, setPdfImgFormat] = useState("png");
  const [pdfImgQuality, setPdfImgQuality] = useState(92);
  const [pdfImgDpi, setPdfImgDpi] = useState(150);

  // compressor state
  const [compItems, setCompItems] = useState<CompItem[]>([]);
  const [compProcessing, setCompProcessing] = useState(false);
  const [compDefaultQuality, setCompDefaultQuality] = useState(80);

  const [toast, setToast] = useState<ToolToastData | null>(null);
  const showToast = useCallback((msg: string, kind: ToolToastData["kind"] = "success") => {
    setToast({ msg, kind });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>(items);
  const compRef = useRef<CompItem[]>(compItems);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    compRef.current = compItems;
  }, [compItems]);

  // Revoke object URLs on unmount.
  useEffect(
    () => () => {
      itemsRef.current.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
        it.pages?.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      });
      compRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    },
    []
  );

  function clearAll() {
    if (processing) return;
    items.forEach((it) => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
      it.pages?.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    });
    setItems([]);
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPdfBlobSize(0);
  }

  function switchMode(next: Mode) {
    if (processing || next === mode) return;
    clearAll();
    setMode(next);
  }

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((curr) => curr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((curr) =>
      curr.filter((it) => {
        if (it.id !== id) return true;
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
        it.pages?.forEach((p) => p.url && URL.revokeObjectURL(p.url));
        return false;
      })
    );
  }

  const addFiles = useCallback(
    (rawFiles: File[]) => {
      if (processing) return;
      const isPdfMode = mode === "pdf2img";
      const allowMultiple = mode !== "pdf2img";
      let valid: File[] = [];
      for (const f of rawFiles) {
        if (isPdfMode) {
          if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
            showToast(`${f.name}: not a PDF.`, "error");
            continue;
          }
        } else if (!f.type.startsWith("image/")) {
          showToast(`${f.name}: not an image.`, "error");
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          showToast(`${f.name}: file too large (max ${formatBytes(MAX_FILE_BYTES)}).`, "error");
          continue;
        }
        valid.push(f);
      }
      if (!allowMultiple) valid = valid.slice(0, 1);
      if (!valid.length) return;
      setItems((curr) => {
        const base = allowMultiple ? curr : [];
        let accepted = valid;
        if (valid.length + base.length > MAX_BATCH_FILES) {
          accepted = valid.slice(0, Math.max(0, MAX_BATCH_FILES - base.length));
          if (valid.length > accepted.length) {
            showToast(
              `Only ${accepted.length} of ${valid.length} files added (queue limit ${MAX_BATCH_FILES}).`,
              "warn"
            );
          }
        }
        const next: Item[] = accepted.map((file) => ({
          id: uid(),
          file,
          status: "queued",
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          resultUrl: null,
          resultExt: null,
          resultSize: null,
          pages: null,
          error: "",
        }));
        return [...base, ...next];
      });
    },
    [mode, processing, showToast]
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = "";
  }

  async function runQueue() {
    if (processing) return;
    if (!items.length) {
      showToast("Add at least one file first.", "error");
      return;
    }
    setProcessing(true);
    try {
      if (mode === "img2img") {
        for (const item of items) {
          if (item.status === "done") continue;
          updateItem(item.id, { status: "processing", error: "" });
          try {
            const { blob, ext } = await convertImage(item.file, imgFormat, imgQuality);
            const url = URL.createObjectURL(blob);
            updateItem(item.id, { status: "done", resultUrl: url, resultExt: ext, resultSize: blob.size });
          } catch (err) {
            updateItem(item.id, {
              status: "failed",
              error: err instanceof Error ? err.message : "Conversion failed.",
            });
          }
        }
      } else if (mode === "img2pdf") {
        if (pdfBlobUrl) {
          URL.revokeObjectURL(pdfBlobUrl);
          setPdfBlobUrl(null);
        }
        setItems((curr) => curr.map((it) => ({ ...it, status: "processing", error: "" })));
        try {
          const blob = await imagesToPdf(items.map((it) => it.file), {
            pageSize: pdfPageSize,
            orientation: pdfOrientation,
            fit: pdfFit,
            marginPct: pdfMargin,
          });
          setPdfBlobUrl(URL.createObjectURL(blob));
          setPdfBlobSize(blob.size);
          setItems((curr) => curr.map((it) => ({ ...it, status: "done" })));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "PDF build failed.";
          showToast(msg, "error");
          setItems((curr) => curr.map((it) => ({ ...it, status: "failed", error: msg })));
        }
      } else if (mode === "pdf2img") {
        for (const item of items) {
          if (item.status === "done") continue;
          updateItem(item.id, { status: "processing", error: "" });
          try {
            const pages = await pdfToImages(item.file, {
              format: pdfImgFormat,
              qualityPct: pdfImgQuality,
              dpi: pdfImgDpi,
            });
            const withUrls = pages.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) }));
            updateItem(item.id, { status: "done", pages: withUrls });
          } catch (err) {
            updateItem(item.id, {
              status: "failed",
              error: err instanceof Error ? err.message : "PDF read failed.",
            });
          }
        }
      }
    } finally {
      setProcessing(false);
    }
  }

  function downloadItem(item: Item) {
    if (!item.resultUrl) return;
    const baseName = (item.file.name || "image").replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = item.resultUrl;
    a.download = `${baseName}.${item.resultExt || "png"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAll() {
    if (mode === "img2img") {
      const ready = items.filter((it) => it.status === "done" && it.resultUrl);
      for (const it of ready) {
        downloadItem(it);
        await new Promise((r) => setTimeout(r, 200));
      }
    } else if (mode === "pdf2img") {
      const ready = items.flatMap((it) =>
        (it.pages || []).map((p) => ({
          ...p,
          base: (it.file.name || "document").replace(/\.[^.]+$/, ""),
        }))
      );
      for (const p of ready) {
        const a = document.createElement("a");
        a.href = p.url;
        a.download = `${p.base}-page-${String(p.index).padStart(3, "0")}.${p.ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }

  function downloadPdf() {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `merged-${items.length}-images.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---- compressor ---- */

  function compAddFiles(fileList: FileList | null | undefined) {
    const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    const arr = Array.from(fileList || []).filter(
      (f) => accepted.includes(f.type) || /\.(jpe?g|png|webp|gif|svg)$/i.test(f.name)
    );
    if (!arr.length) {
      showToast("Only JPG, PNG, WebP, GIF, SVG allowed.", "error");
      return;
    }
    const newItems: CompItem[] = arr.map((f) => ({
      id: uid(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      originalSize: f.size,
      compressedSize: 0,
      quality: compDefaultQuality,
      status: "queued",
      resultBlob: null,
    }));
    setCompItems((prev) => [...prev, ...newItems]);
  }

  function compRemoveItem(id: string) {
    setCompItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function compClearAll() {
    compItems.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    setCompItems([]);
  }

  async function compCompressAll() {
    if (!compItems.length) return;
    setCompProcessing(true);
    let done = 0;
    for (const it of compItems) {
      setCompItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "processing" } : x)));
      try {
        const blob = await compressImage(it.file, it.quality);
        done++;
        setCompItems((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? { ...x, status: "done", compressedSize: blob.size, resultBlob: blob }
              : x
          )
        );
      } catch {
        setCompItems((prev) =>
          prev.map((x) => (x.id === it.id ? { ...x, status: "failed" } : x))
        );
      }
    }
    setCompProcessing(false);
    showToast(`Compressed ${done} of ${compItems.length} images.`);
  }

  async function compRecompressItem(id: string) {
    const it = compItems.find((x) => x.id === id);
    if (!it) return;
    setCompItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "processing" } : x)));
    try {
      const blob = await compressImage(it.file, it.quality);
      setCompItems((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, status: "done", compressedSize: blob.size, resultBlob: blob } : x
        )
      );
    } catch {
      setCompItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "failed" } : x)));
    }
  }

  async function compDownloadAll() {
    const ready = compItems.filter((it) => it.status === "done" && it.resultBlob);
    for (const it of ready) {
      downloadBlob(it.resultBlob!, `compressed-${it.file.name || "image"}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const compTotalOrig = compItems.reduce((s, x) => s + x.originalSize, 0);
  const compTotalComp = compItems.reduce((s, x) => s + (x.compressedSize || 0), 0);
  const compTotalSaved = compTotalOrig > 0 ? (1 - compTotalComp / compTotalOrig) * 100 : 0;
  const compDoneCount = compItems.filter((x) => x.status === "done").length;

  const queueCount = items.length;
  const doneCount = items.filter((it) => it.status === "done").length;

  const btnActive = "bg-brand text-white border-brand shadow";
  const btnIdle =
    "bg-surface text-slate-500 border-slate-200 hover:border-brand dark:border-slate-700 dark:text-slate-400";

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <Link
        href="/tools"
        className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
      >
        <I d={ICONS.arrowLeft} className="h-3.5 w-3.5" /> All tools
      </Link>

      <header className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <I d={ICONS.link} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">File Converter</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Convert images between PNG / JPG / WebP / BMP, merge multiple images into one PDF, or
            split a PDF back into images — plus a smart compressor. Everything runs in your browser;
            files never upload to any server.
          </p>
        </div>
      </header>

      {/* Tool tabs */}
      <div className="mb-5 w-fit rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([
          { id: "converter" as ToolTab, label: "Converter", icon: ICONS.link },
          { id: "compressor" as ToolTab, label: "Compressor", icon: ICONS.min },
        ]).map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setToolTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              toolTab === id
                ? "bg-surface text-brand shadow dark:bg-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            <I d={icon} className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      {toolTab === "compressor" ? (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              compAddFiles(e.dataTransfer.files);
            }}
            onClick={() => compInputRef.current?.click()}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              dragOver
                ? "border-brand bg-brand/5"
                : "border-slate-300 hover:border-brand dark:border-slate-700"
            }`}
          >
            <input
              ref={compInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                compAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <I
              d={ICONS.upload}
              className={`mx-auto mb-2 h-7 w-7 ${dragOver ? "text-brand" : "text-slate-400"}`}
            />
            <p className="text-sm font-bold">Drop images here or click to browse</p>
            <p className="mt-1 text-[11px] text-slate-400">
              JPG, PNG, WebP, GIF, SVG — up to 50 MB each
            </p>
          </div>

          {compItems.length > 0 ? (
            <div className="mt-4 space-y-3">
              {compDoneCount > 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-emerald-500">
                    <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                      {Math.round(compTotalSaved)}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Your images are now {Math.round(compTotalSaved)}% smaller!
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      {formatBytes(compTotalOrig)} → {formatBytes(compTotalComp)}
                    </p>
                  </div>
                </div>
              ) : null}

              {compItems.map((it) => (
                <CompressorCard
                  key={it.id}
                  item={it}
                  onQualityChange={compRecompressItem}
                  onRemove={compRemoveItem}
                />
              ))}

              <div className="flex items-center gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500">Default Q:</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={compDefaultQuality}
                    onChange={(e) => setCompDefaultQuality(Number(e.target.value))}
                    className="w-20 accent-brand"
                  />
                  <span className="w-8 text-[10px] font-bold text-slate-500">
                    {compDefaultQuality}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={compClearAll}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                >
                  Clear
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={compCompressAll}
                  disabled={compProcessing || !compItems.length}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {compProcessing ? (
                    <>
                      {SPINNER} Compressing…
                    </>
                  ) : (
                    <>
                      <I d={ICONS.min} className="h-3 w-3" /> Compress {compItems.length}
                    </>
                  )}
                </button>
                {compDoneCount > 0 ? (
                  <button
                    type="button"
                    onClick={compDownloadAll}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/10"
                  >
                    <I d={ICONS.download} className="h-3 w-3" /> Save All ({compDoneCount})
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Mode picker */}
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMode(m.id)}
                  disabled={processing}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-brand bg-brand/5 shadow"
                      : "border-slate-200 bg-surface hover:border-brand/60 dark:border-slate-800"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <I
                      d={m.icon}
                      className={`h-3.5 w-3.5 ${active ? "text-brand" : "text-slate-400"}`}
                    />
                    <span className="text-xs font-extrabold uppercase tracking-wider">{m.label}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {m.blurb}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            {/* Drop zone + queue */}
            <div className="rounded-2xl border border-slate-200 bg-surface p-4 md:p-5 dark:border-slate-800">
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length) addFiles(files);
                  }}
                  className={`flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition-colors md:min-h-[360px] ${
                    dragOver
                      ? "border-brand bg-brand/5"
                      : "border-slate-200 hover:border-brand hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-md">
                    <I d={ICONS.upload} className="h-5 w-5" />
                  </div>
                  <p className="mb-1 text-sm font-bold">
                    {mode === "pdf2img"
                      ? "Drop a PDF here or click to browse"
                      : "Drop files here or click to browse"}
                  </p>
                  <p className="max-w-md text-[11px] text-slate-500 dark:text-slate-400">
                    {mode === "pdf2img"
                      ? `One PDF up to ${formatBytes(MAX_FILE_BYTES)}`
                      : mode === "img2pdf"
                        ? `Multiple images merge into one PDF · up to ${MAX_BATCH_FILES} files`
                        : `PNG, JPG, JPEG, WebP, BMP · up to ${MAX_BATCH_FILES} files`}
                  </p>
                </button>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Queue · {queueCount} {queueCount === 1 ? "file" : "files"}
                      {doneCount ? ` · ${doneCount} done` : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={processing || mode === "pdf2img"}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all hover:border-brand disabled:opacity-50 dark:border-slate-700"
                      >
                        <I d={ICONS.plus} className="h-2.5 w-2.5" /> Add
                      </button>
                      <button
                        type="button"
                        onClick={clearAll}
                        disabled={processing}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all hover:border-red-400 hover:text-red-600 disabled:opacity-50 dark:border-slate-700"
                      >
                        <I d={ICONS.trash} className="h-2.5 w-2.5" /> Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                    {items.map((it) => {
                      const sb = statusBadge(it.status);
                      return (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/40"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                            {it.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <I d={ICONS.fileText} className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{it.file.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {formatBytes(it.file.size)}
                              {it.resultSize ? ` → ${formatBytes(it.resultSize)}` : ""}
                            </p>
                            {it.error ? (
                              <p className="mt-0.5 truncate text-[10px] text-red-500">{it.error}</p>
                            ) : null}
                            {it.pages ? (
                              <p className="mt-0.5 text-[10px] text-brand">
                                {it.pages.length} page{it.pages.length === 1 ? "" : "s"} rendered
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sb.cls}`}
                          >
                            {sb.text}
                          </span>
                          {it.status === "done" && it.resultUrl ? (
                            <button
                              type="button"
                              onClick={() => downloadItem(it)}
                              title="Download"
                              className="rounded-md p-1.5 text-brand transition-colors hover:bg-brand/10"
                            >
                              <I d={ICONS.download} className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            disabled={processing}
                            title="Remove from queue"
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <I d={ICONS.x} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* img2pdf result */}
                  {mode === "img2pdf" && pdfBlobUrl ? (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                        <I d={ICONS.fileText} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">Combined PDF ready</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {items.length} image{items.length === 1 ? "" : "s"} merged ·{" "}
                          {formatBytes(pdfBlobSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadPdf}
                        className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition-all hover:opacity-90"
                      >
                        <I d={ICONS.download} className="h-3 w-3" /> Download PDF
                      </button>
                    </div>
                  ) : null}

                  {/* pdf2img page grid */}
                  {mode === "pdf2img" && items.some((it) => it.pages?.length) ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {items
                        .flatMap((it) =>
                          (it.pages || []).map((p) => ({
                            ...p,
                            base: (it.file.name || "document").replace(/\.[^.]+$/, ""),
                          }))
                        )
                        .map((p) => (
                          <a
                            key={`${p.base}-${p.index}`}
                            href={p.url}
                            download={`${p.base}-page-${String(p.index).padStart(3, "0")}.${p.ext}`}
                            className="block overflow-hidden rounded-md border border-slate-200 bg-surface transition-all hover:border-brand dark:border-slate-700"
                            title={`Page ${p.index} (${p.ext.toUpperCase()})`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`Page ${p.index}`} className="h-24 w-full object-cover" />
                            <p className="py-1 text-center text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              Page {p.index}
                            </p>
                          </a>
                        ))}
                    </div>
                  ) : null}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple={mode !== "pdf2img"}
                accept={modeDef.accept}
                onChange={onFileChange}
                className="hidden"
              />
            </div>

            {/* Settings sidebar */}
            <aside className="self-start rounded-2xl border border-slate-200 bg-surface p-4 md:p-5 dark:border-slate-800">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand">
                Settings
              </p>

              {mode === "img2img" ? (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Output format
                  </p>
                  <div className="mb-4 grid grid-cols-2 gap-1.5">
                    {IMG_FORMATS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setImgFormat(f.id)}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          imgFormat === f.id ? btnActive : btnIdle
                        }`}
                        title={f.blurb}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Quality · {imgQuality}%
                  </p>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={1}
                    value={imgQuality}
                    onChange={(e) => setImgQuality(Number(e.target.value))}
                    className="mb-2 w-full accent-brand"
                  />
                  <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Quality only affects lossy formats (JPG / WebP). PNG and BMP ignore it.
                  </p>
                </>
              ) : null}

              {mode === "img2pdf" ? (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Page size
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {PAGE_SIZES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPdfPageSize(p.id)}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          pdfPageSize === p.id ? btnActive : btnIdle
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Orientation
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {["portrait", "landscape"].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setPdfOrientation(o)}
                        disabled={pdfPageSize === "auto"}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
                          pdfOrientation === o ? btnActive : btnIdle
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Fit
                  </p>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {FIT_MODES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPdfFit(f.id)}
                        title={f.blurb}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          pdfFit === f.id ? btnActive : btnIdle
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Margin · {pdfMargin}%
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={pdfMargin}
                    onChange={(e) => setPdfMargin(Number(e.target.value))}
                    className="mb-3 w-full accent-brand"
                  />

                  <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Drop multiple images, hit Convert, and you&apos;ll get one combined PDF with one
                    image per page.
                  </p>
                </>
              ) : null}

              {mode === "pdf2img" ? (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Output format
                  </p>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {IMG_FORMATS.filter((f) => ["png", "jpg", "webp"].includes(f.id)).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPdfImgFormat(f.id)}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          pdfImgFormat === f.id ? btnActive : btnIdle
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Render DPI
                  </p>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {PDF_RENDER_DPI.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setPdfImgDpi(d.id)}
                        title={d.blurb}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          pdfImgDpi === d.id ? btnActive : btnIdle
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {pdfImgFormat !== "png" ? (
                    <>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Quality · {pdfImgQuality}%
                      </p>
                      <input
                        type="range"
                        min={40}
                        max={100}
                        step={1}
                        value={pdfImgQuality}
                        onChange={(e) => setPdfImgQuality(Number(e.target.value))}
                        className="mb-3 w-full accent-brand"
                      />
                    </>
                  ) : null}

                  <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Each PDF page becomes one image. Higher DPI = sharper but slower.
                  </p>
                </>
              ) : null}

              <button
                type="button"
                onClick={runQueue}
                disabled={processing || !items.length}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  <>
                    {SPINNER} Working…
                  </>
                ) : (
                  <>
                    <I d={ICONS.layers} className="h-3.5 w-3.5" /> Convert
                  </>
                )}
              </button>

              {(mode === "img2img" || mode === "pdf2img") && doneCount > 0 ? (
                <button
                  type="button"
                  onClick={downloadAll}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-brand/40 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-brand transition-all hover:bg-brand/5"
                >
                  <I d={ICONS.download} className="h-3 w-3" /> Download all
                </button>
              ) : null}
            </aside>
          </div>
        </>
      )}

      <ToolToast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
