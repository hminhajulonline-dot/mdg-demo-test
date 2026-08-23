"use client";

import { useRef, useState } from "react";

export default function Dropzone({
  onFiles,
  disabled,
  maxFiles,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  maxFiles: number;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none ${
        dragging
          ? "border-brand bg-brand/5"
          : "border-slate-300 dark:border-slate-700 hover:border-brand/60 hover:bg-slate-50 dark:hover:bg-slate-900"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.svg,.ai,.eps,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <svg
        className="mx-auto h-10 w-10 text-brand"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="mt-3 font-medium">
        Drag &amp; drop images or vector files here, or click to browse
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        JPG, PNG, WebP, GIF, BMP, SVG, AI, EPS - up to {maxFiles} files per batch
      </p>
    </div>
  );
}
