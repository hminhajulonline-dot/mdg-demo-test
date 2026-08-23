"use client";

/**
 * Vector file preparation (SVG / AI / EPS / PDF) - rasterizes page one to
 * JPEG base64 so the same generation pipeline handles vectors.
 *
 * Chain (better than CSV Tree):
 *   1. pdf.js renders the buffer as-is   - most AI/PDF-compatible files
 *   2. %PDF- payload slicing + retry     - AI exports with a PostScript prefix
 *   3. Embedded TIFF preview extraction  - classic EPS files
 *   4. Friendly, actionable errors otherwise.
 */

const MAX_EDGE = 1568;
const QUALITY = 0.88;

export interface PreparedImage {
  base64: string;
  mimeType: string;
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
async function tryRenderPdf(
  data: Uint8Array,
  firstErrorMessage?: { value: string }
): Promise<PreparedImage | null> {
  // Two worker strategies: local file, then CDN (CSV Tree approach).
  for (const mode of ["local", "cdn"] as WorkerMode[]) {
    try {
      const pdfjs = await loadPdfjs(mode);
      const loadingTask = pdfjs.getDocument({ data });
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
      // Remember why the first strategy failed so the final error is
      // actionable instead of a generic "no PDF-compatible data".
      if (firstErrorMessage && !firstErrorMessage.value && err instanceof Error) {
        firstErrorMessage.value = err.message;
      }
    }
  }
  return null;
}

/** Slice a buffer to its embedded "%PDF-" payload, or null when absent. */
function sliceToPdfMarker(bytes: Uint8Array): Uint8Array | null {
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  outer: for (let i = 1; i <= bytes.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) continue outer;
    }
    return bytes.slice(i);
  }
  return null;
}

/**
 * Decode an embedded TIFF preview out of an EPS file. EPS previews are
 * usually uncompressed RGB(A) little/big-endian TIFFs; parse header +
 * first IFD + packed strip and paint to canvas. Ported from CSV Tree.
 */
function extractEpsTiffPreview(bytes: Uint8Array): PreparedImage | null {
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
  if (comp !== 1 || bps !== 8 || !W || !H || !strip) return null;
  strip += start;

  const rowBytes = W * spp;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);

  for (let row = 0; row < H; row++) {
    const src = strip + row * rowBytes;
    if (src + rowBytes > bytes.length) break;
    const dst = row * W * 4;
    for (let x = 0; x < W; x++) {
      if (spp === 4) {
        img.data[dst + x * 4] = bytes[src + x * 4];
        img.data[dst + x * 4 + 1] = bytes[src + x * 4 + 1];
        img.data[dst + x * 4 + 2] = bytes[src + x * 4 + 2];
        img.data[dst + x * 4 + 3] = bytes[src + x * 4 + 3];
      } else if (spp === 3) {
        img.data[dst + x * 4] = bytes[src + x * 3];
        img.data[dst + x * 4 + 1] = bytes[src + x * 3 + 1];
        img.data[dst + x * 4 + 2] = bytes[src + x * 3 + 2];
        img.data[dst + x * 4 + 3] = 255;
      } else {
        const g = bytes[src + x];
        img.data[dst + x * 4] = g;
        img.data[dst + x * 4 + 1] = g;
        img.data[dst + x * 4 + 2] = g;
        img.data[dst + x * 4 + 3] = 255;
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

/** Rasterize an AI/EPS/PDF file through the full fallback chain. */
export async function preparePostScript(
  file: File,
  ext: "ai" | "eps" | "pdf"
): Promise<PreparedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const firstError = { value: "" };

  // 1. Render as-is (most AI >= CS files are PDF-compatible).
  const direct = await tryRenderPdf(bytes, firstError);
  if (direct) return direct;

  // 2. Retry against a sliced %PDF- payload (PostScript-prefixed exports).
  const sliced = sliceToPdfMarker(bytes);
  if (sliced) {
    const viaSlice = await tryRenderPdf(sliced);
    if (viaSlice) return viaSlice;
  }

  // 3. EPS: decode the embedded TIFF preview.
  if (ext === "eps") {
    const tiff = extractEpsTiffPreview(bytes);
    if (tiff) return tiff;
  }

  const technical = firstError.value
    ? ` Technical detail: ${firstError.value}`
    : "";
  throw new Error(
    (ext === "eps"
      ? `${file.name}: no renderable preview found. Re-export the EPS with an embedded preview (Illustrator: "Embed preview" / 72-150 dpi) or upload an SVG/PDF/JPG version instead.`
      : `${file.name}: this AI file has no PDF-compatible data. In Illustrator use File > Save As and tick "Create PDF Compatible File", or export as SVG/PNG and add that instead.`) +
      technical
  );
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
