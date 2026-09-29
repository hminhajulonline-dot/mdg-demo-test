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
      className={`rounded-2xl border-2 border-dashed text-center transition-colors cursor-pointer select-none ${
        dragging
          ? "border-brand bg-brand/5"
          : "border-slate-300 dark:border-slate-700 hover:border-brand/60 hover:bg-slate-50 dark:hover:bg-slate-900"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,video/mp4,video/quicktime,.svg,.ai,.eps,.pdf,.mp4,.mov"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <div className="px-6 py-8 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-4 w-4 text-brand"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm font-bold uppercase tracking-wider">Upload Files</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
          {["Images", "Videos", "SVG", "AI", "EPS"].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-0.5 rounded-full bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-bold uppercase"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Drag &amp; drop files here, or <span className="underline">browse</span>
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          Supports image, video, SVG, AI &amp; EPS - up to {maxFiles} files per batch
        </p>
      </div>
    </div>
  );
}
