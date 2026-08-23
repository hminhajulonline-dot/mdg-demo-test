"use client";

/**
 * Vector file preparation (SVG / AI / EPS / PDF) - rasterizes page one to
 * JPEG base64 so the same generation pipeline handles vectors.
 * Better than CSV Tree: no external proxy needed, everything runs locally.
 */

const MAX_EDGE = 1568;
const QUALITY = 0.88;

export interface PreparedImage {
  base64: string;
  mimeType: string;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Rasterize an AI/EPS/PDF file. */
export async function preparePostScript(
  file: File,
  ext: "ai" | "eps" | "pdf"
): Promise<PreparedImage> {
  const pdfjs = await loadPdfjs();
  let data = new Uint8Array(await file.arrayBuffer());

  // Some Illustrator exports prepend a plain PostScript header before the
  // real PDF payload. Locate the "%PDF-" marker and slice to it so pdf.js
  // gets a clean document instead of "Invalid PDF structure".
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  outer: for (let i = 0; i <= data.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (data[i + j] !== marker[j]) continue outer;
    }
    if (i > 0) data = data.slice(i);
    break;
  }

  const looksLikePdf =
    data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;

  if (!looksLikePdf) {
    throw new Error(
      ext === "eps"
        ? `${file.name}: browsers cannot render EPS directly. Open it in Illustrator and export as SVG, PNG or AI with "Create PDF Compatible File" checked, then add that file.`
        : `${file.name}: this AI file has no PDF-compatible data. Re-save from Illustrator (File > Save As, tick "Create PDF Compatible File") or export as SVG/PNG.`
    );
  }

  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Scale so the longest edge hits MAX_EDGE; small artwork is upscaled
    // (max 3x) so the vision model gets enough detail.
    const scale = Math.min(3, MAX_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    // White backdrop - EPS/AI pages are transparent and metadata should
    // describe artwork, not a black void.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) throw new Error("Could not render the vector file.");
    return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
  } catch (err) {
    if (
      err instanceof Error &&
      /password|encrypt/i.test(err.message)
    ) {
      throw new Error(
        `${file.name}: this file is password-protected or encrypted. Remove security in Illustrator/Acrobat and try again.`
      );
    }
    throw err;
  } finally {
    void loadingTask.destroy();
  }
}

/** Rasterize an SVG via <img> + canvas. */
export async function prepareSvg(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read SVG ${file.name}`));
      el.src = url;
    });

    const scale = Math.min(
      MAX_EDGE / Math.max(img.naturalWidth || MAX_EDGE, img.naturalHeight || MAX_EDGE),
      8
    );
    const width = Math.max(1, Math.round((img.naturalWidth || MAX_EDGE) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || MAX_EDGE) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) throw new Error("Could not render the SVG.");
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
