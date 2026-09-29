"use client";

import { useEffect, useState } from "react";
import type { GenerationMode } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  count: number;
  failedCount: number;
  mode: GenerationMode;
  onDownloadCsv: () => void;
  onDownloadTxt?: () => void;
}

/** localStorage key for the "Don't show again" opt-out (CSV Tree parity). */
export const HIDE_SUCCESS_MODAL_KEY = "mmg_hide_success_modal";

export function isSuccessModalHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_SUCCESS_MODAL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Post-batch success popup (CSV Tree parity): confirms the batch finished
 * and offers the correct downloads - metadata exports CSV only,
 * prompt exports CSV + TXT. Closes on Escape; "Don't show again"
 * persists an opt-out so future full-batch runs skip the popup.
 */
export default function SuccessModal({
  open,
  onClose,
  count,
  failedCount,
  mode,
  onDownloadCsv,
  onDownloadTxt,
}: Props) {
  const [hideForever, setHideForever] = useState(false);

  // Escape closes the dialog (CSV Tree's useEscapeKey).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = mode === "img2prompt" ? "Prompts Generated!" : "Metadata Generated!";
  const unit =
    mode === "img2prompt"
      ? count === 1
        ? "prompt"
        : "prompts"
      : count === 1
        ? "metadata set"
        : "metadata sets";
  const subtitle =
    count > 0 ? `Successfully generated ${count} ${unit}.` : "Batch finished.";

  function close() {
    if (hideForever) {
      try {
        localStorage.setItem(HIDE_SUCCESS_MODAL_KEY, "1");
      } catch {}
    }
    setHideForever(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <button aria-hidden tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />
      <div className="relative w-full max-w-sm rounded-2xl bg-background border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-brand px-6 py-5 text-white text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/20 mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-white/85 mt-0.5">{subtitle}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {failedCount > 0 ? (
            <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 text-center">
              {failedCount} item{failedCount > 1 ? "s" : ""} failed even after retry. Regenerate them individually from the cards below.
            </p>
          ) : null}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Download
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  onDownloadCsv();
                  close();
                }}
                disabled={count === 0}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {mode === "img2prompt" ? "Download Prompts CSV" : "Download Metadata CSV"}
              </button>
              {mode === "img2prompt" && onDownloadTxt ? (
                <button
                  onClick={() => {
                    onDownloadTxt();
                    close();
                  }}
                  disabled={count === 0}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  Download Prompts TXT
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              You can still download later from the toolbar.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideForever}
                onChange={(e) => setHideForever(e.target.checked)}
                className="accent-[var(--brand)]"
              />
              Don&apos;t show again
            </label>
            <button
              onClick={close}
              className="px-5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
