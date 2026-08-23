"use client";

/**
 * Client-side raster preparation for raster images (downscale to JPEG).
 * Vector files (SVG/AI/EPS/PDF) go through lib/client/vector.ts instead.
 */

const MAX_EDGE = 1568;
const QUALITY = 0.85;

export interface PreparedImage {
  base64: string; // raw base64, no data: prefix
  mimeType: string;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported in this browser.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) throw new Error("Could not process the image.");
    return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> path for exotic formats
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read ${file.name}`));
      el.src = url;
    });
    return img as unknown as ImageBitmap;
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
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(blob);
  });
}
