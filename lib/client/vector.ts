"use client";

/**
 * Vector file preparation (SVG / AI / EPS / PDF) - rasterizes page one to
 * JPEG base64 so the same generation pipeline handles vectors.
 *
 * Chain (better than CSV Tree):
 *   1. pdf.js renders the buffer as-is   - most AI/PDF-compatible files
 *   2. %PDF- payload slicing + retry     - AI exports with a PostScript prefix
 *   3. Embedded TIFF preview extraction  - classic EPS files (raw + JPEG)
 *   4. Embedded raw JPEG extraction      - EPS with a DCT preview
 *   5. Ghostscript WASM                  - pure PostScript, any EPS
 *   6. Friendly, actionable errors otherwise.
 */

const MAX_EDGE = 1568;
const QUALITY = 0.88;

export interface PreparedImage {
  base64: string;
  mimeType: string;
  /** Vector had no renderable preview - placeholder tile was generated. */
  placeholder?: boolean;
  /** Original filename (placeholder path feeds it to the text prompt). */
  filenameFallback?: string;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
type WorkerMode = "local" | "cdn";

async function loadPdfjs(mode: WorkerMode) {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Local bundled worker first; CDN as a resilient fallback because
      // bundlers can break pdf.js's fake-worker dynamic imports.
      pdfjs.GlobalWorkerOptions.workerSrc =
        mode === "cdn"
          ? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
          : "/pdf.worker.min.mjs";
      return pdfjs;
    });
  } else {
    const pdfjs = await pdfjsPromise;
    pdfjs.GlobalWorkerOptions.workerSrc =
      mode === "cdn"
        ? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        : "/pdf.worker.min.mjs";
  }
  return pdfjsPromise;
}

/** Try rendering page one of a PDF payload; null on any failure. */
async function tryRenderPdf(data: Uint8Array): Promise<PreparedImage | null> {
  // Two worker strategies: local file, then CDN (CSV Tree approach).
  for (const mode of ["local", "cdn"] as WorkerMode[]) {
    try {
      const pdfjs = await loadPdfjs(mode);
      const loadingTask = pdfjs.getDocument({
        data,
        // Silence per-byte parser warnings - they freeze the browser on
        // malformed input.
        verbosity: 0,
      } as Parameters<typeof pdfjs.getDocument>[0]);
      const doc = await loadingTask.promise;
      try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, MAX_EDGE / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        // White backdrop - vector pages are transparent and metadata should
        // describe artwork, not a black void.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", QUALITY)
        );
        if (!blob) continue;
        return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
      } finally {
        void loadingTask.destroy();
      }
    } catch (err) {
      void err;
    }
  }
  return null;
}

/** Slice a buffer to its embedded "%PDF-" payload, or null when absent. */
function findPdfOffset(bytes: Uint8Array): number {
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Ghostscript WASM - renders ANY PostScript/EPS (CSV Tree approach)    */
/* ------------------------------------------------------------------ */

interface GsModule {
  FS: {
    writeFile(name: string, data: Uint8Array): void;
    readFile(name: string): Uint8Array;
    unlink(name: string): void;
  };
  callMain(args: string[]): unknown;
  ready?: Promise<void>;
}
type GsFactory = (opts: {
  noInitialRun: boolean;
  locateFile: (p: string) => string;
}) => Promise<GsModule>;

let gsInstance: Promise<GsModule> | null = null;

async function getGhostscript(): Promise<GsModule> {
  if (gsInstance) return gsInstance;
  gsInstance = (async () => {
    const w = window as unknown as {
      Module?: GsFactory;
      exports?: { Module?: GsFactory };
    };
    const hasFactory =
      typeof w.Module === "function" ||
      (w.exports && typeof w.exports.Module === "function");
    if (!hasFactory) {
      await new Promise<void>((resolve, reject) => {
        const s1 = document.createElement("script");
        s1.src = "/gs/browser.js";
        s1.onload = () => {
          const s2 = document.createElement("script");
          s2.src = "/gs/gs.js";
          s2.onload = () => resolve();
          s2.onerror = () => reject(new Error("gs.js load failed"));
          document.head.appendChild(s2);
        };
        s1.onerror = () => reject(new Error("browser.js load failed"));
        document.head.appendChild(s1);
      });
    }
    const factory: GsFactory | null =
      w.exports && typeof w.exports.Module === "function"
        ? w.exports.Module
        : typeof w.Module === "function"
          ? w.Module
          : null;
    if (!factory) throw new Error("Ghostscript factory not found");
    const mod = await factory({
      noInitialRun: true,
      locateFile: (p: string) => `/gs/${p}`,
    });
    if (!mod || !mod.FS || !mod.callMain) {
      throw new Error("Ghostscript missing FS/callMain");
    }
    if (mod.ready) await mod.ready;
    return mod;
  })();
  gsInstance.catch(() => {
    gsInstance = null;
  });
  return gsInstance;
}

/**
 * Render a PostScript/EPS/AI file to a JPEG blob via Ghostscript WASM.
 * Used as the deep fallback in preparePostScript and by the EPS→JPG tool.
 */
export async function rasterizePostScriptToJpeg(
  file: File,
  opts: { dpi?: number; quality?: number } = {}
): Promise<Blob> {
  const dpi = Math.min(300, Math.max(72, opts.dpi ?? 200));
  const quality = Math.min(100, Math.max(40, opts.quality ?? 95));
  const mod = await getGhostscript();
  const data = new Uint8Array(await file.arrayBuffer());
  const inN = "/input.eps";
  const outN = "/output.jpg";
  try {
    mod.FS.unlink(inN);
  } catch {}
  try {
    mod.FS.unlink(outN);
  } catch {}
  mod.FS.writeFile(inN, data);
  mod.callMain([
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-dEPSCrop",
    "-r" + dpi,
    "-sDEVICE=jpeg",
    "-dJPEGQ=" + quality,
    "-dColorDevice=true",
    "-dColorConversionStrategy=/RGB",
    "-dProcessColorModel=/DeviceRGB",
    "-sOutputFile=" + outN,
    inN,
  ]);
  const out = mod.FS.readFile(outN) as Uint8Array;
  try {
    mod.FS.unlink(inN);
  } catch {}
  try {
    mod.FS.unlink(outN);
  } catch {}
  if (!out || out.length < 100) throw new Error("GS produced empty output");
  return new Blob([out as unknown as BlobPart], { type: "image/jpeg" });
}

async function tryGhostscript(
  bytes: Uint8Array,
  filename: string,
  dpi = 200
): Promise<PreparedImage | null> {
  try {
    const blob = await rasterizePostScriptToJpeg(
      new File([bytes as unknown as BlobPart], filename, { type: "application/postscript" }),
      { dpi, quality: 95 }
    );
    return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Embedded raw JPEG extraction (EPS DCT previews)                     */
/* ------------------------------------------------------------------ */

function findEmbeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      for (let j = i + 3; j < bytes.length - 1; j++) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          const len = j + 2 - i;
          if (len > 500) return bytes.slice(i, j + 2);
          break;
        }
      }
      i += 2;
    }
  }
  return null;
}

/** Decode JPEG bytes to a (downscaled) JPEG base64 preview. */
async function decodeJpegBytes(bytes: Uint8Array): Promise<PreparedImage | null> {
  try {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("bad jpeg"));
        el.src = url;
      });
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return null;
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", QUALITY)
      );
      if (!out) return null;
      return { base64: await blobToBase64(out), mimeType: "image/jpeg" };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Decode an embedded TIFF preview out of an EPS file. Supports uncompressed
 * RGB(A) strips (comp=1) and JPEG-compressed TIFFs (comp=6, common in
 * Illustrator EPS). Ported from CSV Tree.
 */
async function extractEpsTiffPreview(bytes: Uint8Array): Promise<PreparedImage | null> {
  let start = -1;
  for (let i = 0; i < bytes.length - 4; i++) {
    if (
      (bytes[i] === 0x49 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x2a && bytes[i + 3] === 0x00) ||
      (bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x2a)
    ) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const le = bytes[start] === 0x49;
  const u16 = (o: number) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
  const u32 = (o: number) =>
    le
      ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)
      : (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];

  const ifdOff = u32(start + 4);
  if (ifdOff < 8 || ifdOff + 2 > bytes.length) return null;
  const entries = u16(start + ifdOff);
  const tags: Record<number, number> = {};
  for (let e = 0; e < entries; e++) {
    const o = start + ifdOff + 2 + e * 12;
    if (o + 12 > bytes.length) break;
    const tag = u16(o);
    const type = u16(o + 2);
    if (type === 3) tags[tag] = u16(o + 8);
    else if (type === 4) tags[tag] = u32(o + 8);
  }

  const W = tags[256];
  const H = tags[257];
  const bps = tags[258] || 8;
  const comp = tags[259] || 1;
  const spp = tags[277] || 1;
  let strip = tags[273] || 0;
  const stripBytes = tags[279] || 0;

  if (!W || !H || !strip) return null;
  strip += start;

  // JPEG-compressed TIFF preview: the strip IS a raw JPEG stream.
  if (comp === 6) {
    const end = stripBytes ? Math.min(bytes.length, strip + stripBytes) : bytes.length;
    return decodeJpegBytes(bytes.slice(strip, end));
  }

  // Some EPS files embed print-resolution previews (A-size @ 300 dpi can
  // exceed 60 MP). Decode DOWNSAMPLED so we never allocate gigapixel
  // ImageData - that was freezing/crashing tabs.
  const MAX_PREVIEW_EDGE = 1400;
  if (comp !== 1 || bps !== 8) return null;
  const step = Math.max(1, Math.ceil(Math.max(W, H) / MAX_PREVIEW_EDGE));
  const outW = Math.max(1, Math.floor(W / step));
  const outH = Math.max(1, Math.floor(H / step));

  const rowBytes = W * spp;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(outW, outH);

  for (let oy = 0; oy < outH; oy++) {
    const srcRow = strip + oy * step * rowBytes;
    const dst = oy * outW * 4;
    for (let ox = 0; ox < outW; ox++) {
      const src = srcRow + ox * step * spp;
      if (src + spp > bytes.length) break;
      if (spp === 4) {
        img.data[dst + ox * 4] = bytes[src];
        img.data[dst + ox * 4 + 1] = bytes[src + 1];
        img.data[dst + ox * 4 + 2] = bytes[src + 2];
        img.data[dst + ox * 4 + 3] = bytes[src + 3];
      } else if (spp === 3) {
        img.data[dst + ox * 4] = bytes[src];
        img.data[dst + ox * 4 + 1] = bytes[src + 1];
        img.data[dst + ox * 4 + 2] = bytes[src + 2];
        img.data[dst + ox * 4 + 3] = 255;
      } else {
        const g = bytes[src];
        img.data[dst + ox * 4] = g;
        img.data[dst + ox * 4 + 1] = g;
        img.data[dst + ox * 4 + 2] = g;
        img.data[dst + ox * 4 + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const blob = canvasToJpegSync(canvas);
  return blob ? { base64: blob, mimeType: "image/jpeg" } : null;
}

function canvasToJpegSync(canvas: HTMLCanvasElement): string | null {
  // toDataURL is synchronous - fine for the small EPS previews.
  const url = canvas.toDataURL("image/jpeg", QUALITY);
  const idx = url.indexOf(",");
  return idx >= 0 ? url.slice(idx + 1) : null;
}

/**
 * Rasterize a vector file through CSV Tree's exact fallback chain.
 *
 *   EPS/AI: Ghostscript WASM first (real full-colour vector art), then
 *           pdf.js on embedded PDF data, embedded TIFF, embedded JPEG.
 *   PDF:    pdf.js first, embedded previews, Ghostscript last.
 *
 * NEVER throws for EPS/AI/PDF (CSV Tree parity): when nothing is
 * renderable we return a placeholder tile with `placeholder: true` so the
 * card still shows a preview AND metadata is generated from the filename
 * instead of failing the whole card.
 */
export async function preparePostScript(
  file: File,
  ext: "ai" | "eps" | "pdf"
): Promise<PreparedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Guard: absurdly large files would freeze the tab during any scan.
  if (bytes.length > 120 * 1024 * 1024) {
    throw new Error(
      `${file.name}: ${(bytes.length / 1024 / 1024).toFixed(0)} MB is too large. Please export a smaller preview version.`
    );
  }

  const isPostScript = ext === "eps" || ext === "ai";

  // CSV Tree parity: Ghostscript FIRST for EPS/AI so the preview shows the
  // real vector artwork in full colour instead of a stale embedded bitmap.
  if (isPostScript) {
    const viaGs = await tryGhostscript(bytes, file.name);
    if (viaGs) return viaGs;
  }

  const pdfOff = findPdfOffset(bytes);

  // CRITICAL: never hand pure PostScript data to pdf.js. Its parser logs a
  // console warning PER invalid byte, which freezes/crashes the browser on
  // multi-MB EPS files. Only run it when real PDF bytes exist.
  if (pdfOff >= 0) {
    const direct = await tryRenderPdf(bytes);
    if (direct) return direct;

    if (pdfOff > 0) {
      const viaSlice = await tryRenderPdf(bytes.slice(pdfOff));
      if (viaSlice) return viaSlice;
    }
  }

  // Embedded previews - instant, no engine load.
  const tiff = await extractEpsTiffPreview(bytes);
  if (tiff) return tiff;

  const rawJpeg = findEmbeddedJpeg(bytes);
  if (rawJpeg) {
    const decoded = await decodeJpegBytes(rawJpeg);
    if (decoded) return decoded;
  }

  // Deep fallback: Ghostscript WASM renders pure PostScript (loads ~16 MB
  // once per session, then cached). Skipped above for EPS/AI - already ran.
  if (!isPostScript) {
    const viaGs = await tryGhostscript(bytes, file.name);
    if (viaGs) return viaGs;
  }

  // Nothing renderable - CSV Tree placeholder tile instead of an error, so
  // generation still succeeds using the filename (no card ever fails).
  return buildPlaceholderPreview(file.name, ext);
}

/**
 * White 1024×1024 tile with a filename note - CSV Tree's exact fallback
 * when a vector file has no renderable preview.
 */
function buildPlaceholderPreview(filename: string, ext: "ai" | "eps" | "pdf"): PreparedImage {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { base64: "", mimeType: "image/jpeg", placeholder: true, filenameFallback: filename };
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 24px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ext === "eps" ? "EPS Preview" : ext === "ai" ? "AI Preview" : "PDF Preview", 512, 480);
  ctx.fillStyle = "#6b7280";
  ctx.font = "14px Inter, sans-serif";
  ctx.fillText(filename, 512, 510);
  ctx.fillText(
    ext === "eps" ? "Preview raster failed — metadata from filename" : "No PDF preview — metadata from filename",
    512,
    530
  );
  return {
    base64: canvasToJpegSync(canvas) ?? "",
    mimeType: "image/jpeg",
    placeholder: true,
    filenameFallback: filename,
  };
}

/** Rasterize an SVG via <img> + canvas. */
export async function prepareSvg(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            `${file.name}: could not decode the SVG. It may reference external images/fonts - inline them or export as PNG and re-upload.`
          )
        );
      el.src = url;
    });

    const natW = Math.max(1, img.naturalWidth || 1024);
    const natH = Math.max(1, img.naturalHeight || Math.round(natW * 0.66));
    const longest = Math.max(natW, natH);
    const scale =
      longest > MAX_EDGE ? MAX_EDGE / longest : longest < MAX_EDGE / 2 ? Math.min(3, MAX_EDGE / longest) : 1;
    const width = Math.max(1, Math.round(natW * scale));
    const height = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) throw new Error(`Could not render ${file.name}.`);
    return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

export type VectorKind = "svg" | "postscript" | null;

export function detectVector(filename: string): VectorKind {
  const name = filename.toLowerCase();
  if (name.endsWith(".svg")) return "svg";
  if (name.endsWith(".ai") || name.endsWith(".eps") || name.endsWith(".pdf"))
    return "postscript";
  return null;
}
