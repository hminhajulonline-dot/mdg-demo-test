"use client";

import { useState } from "react";
import { getCardFields } from "@/lib/csv/formats";
import type { GenerationMode } from "@/lib/types";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export interface CardItem {
  id: string;
  filename: string;
  mode: GenerationMode;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
  previewUrl?: string;
  // metadata result
  title: string;
  description: string;
  keywords: string[];
  category?: string;
  prompt?: string; // freepik extra
  baseModel?: string;
  // img2prompt result
  promptText?: string;
}

export function metadataToText(item: CardItem, platform?: string): string {
  if (item.mode === "img2prompt") {
    return `${item.filename}\n${item.promptText || ""}`;
  }
  const fields = platform ? getCardFields(platform) : null;
  const has = (f: string) => (fields ? (fields as string[]).includes(f) : true);
  const lines = [
    `File: ${item.filename}`,
    has("title") ? `Title: ${item.title}` : "",
    has("description") ? `Description: ${item.description}` : "",
    has("keywords") ? `Keywords: ${item.keywords.join(", ")}` : "",
    !fields && item.category ? `Category: ${item.category}` : "",
    has("prompt") && item.prompt ? `Prompt: ${item.prompt}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

interface Props {
  item: CardItem;
  platform: string;
  onUpdate: (patch: Partial<CardItem>) => void;
  onRegenerate: () => void;
  onRemove: () => void;
}

export default function ResultCard({ item, platform, onUpdate, onRegenerate, onRemove }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  // Card mirrors the CSV export columns of the selected platform.
  const fields = getCardFields(platform);
  const has = (f: string) => (fields as string[]).includes(f);
  const showTitle = has("title");
  const showDescription = has("description");
  const showKeywords = has("keywords");
  const showPrompt = has("prompt");
  const showBaseModel = has("baseModel");
  const showCategory = platform === "general" && !showPrompt;

  async function doCopy(label: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? label : "failed");
    setTimeout(() => setCopied(null), 1500);
  }

  const busy = item.status === "processing" || item.status === "pending";

  return (
    <div className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface shadow-sm hover:shadow-md hover:border-brand/40 transition-all overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-sm font-semibold truncate" title={item.filename}>
          {item.filename}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill item={item} />
          {!busy && (
            <>
              <IconBtn
                title={item.status === "error" ? "Retry" : "Regenerate"}
                onClick={onRegenerate}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
              </IconBtn>
              <IconBtn title="Remove" onClick={onRemove}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
              </IconBtn>
            </>
          )}
          {busy && (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-label="Processing" />
          )}
        </div>
      </div>

      {/* Error banner */}
      {item.status === "error" ? (
        <div className="px-4 sm:px-5 py-4 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/40">
          <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{item.error}</p>
          <button onClick={onRegenerate} className="mt-2 text-xs font-semibold text-brand hover:underline">
            Try again →
          </button>
        </div>
      ) : (
        /* Two-column body: preview half + data half */
        <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:border-slate-800 md:dark:divide-slate-800">
          {/* LEFT HALF - preview */}
          <div className="relative min-h-[220px] bg-white dark:bg-slate-900/60 flex items-center justify-center p-3">
            {item.previewUrl ? (
              <a
                href={item.previewUrl}
                target="_blank"
                rel="noreferrer"
                title="Click to view full size"
                className="block w-full h-full cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.filename}
                  className="w-full h-full max-h-[320px] object-contain rounded-lg"
                />
              </a>
            ) : (
              <div className="text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" /></svg>
                </span>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Vector file</p>
              </div>
            )}
            {busy ? (
              <span className="absolute inset-0 rounded-lg bg-background/60 backdrop-blur-[1px] grid place-items-center">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
              </span>
            ) : null}
          </div>

          {/* RIGHT HALF - data */}
          <div className="px-4 sm:px-5 py-4 space-y-3">
            {item.mode === "img2prompt" ? (
              <Field
                label={`Prompt (${(item.promptText || "").length} chars)`}
                value={item.promptText || ""}
                rows={8}
                disabled={busy}
                onChange={(v) => onUpdate({ promptText: v })}
                onCopy={() => doCopy("prompt", item.promptText || "")}
                copied={copied === "prompt"}
              />
            ) : (
              <>
                {showTitle ? (
                  <Field
                    label={`Title · ${item.title.length}/${platform === "freepik" ? 250 : 100}`}
                    value={item.title}
                    rows={2}
                    disabled={busy}
                    onChange={(v) => onUpdate({ title: v })}
                    onCopy={() => doCopy("title", item.title)}
                    copied={copied === "title"}
                  />
                ) : null}
                {showDescription ? (
                  <Field
                    label="Description"
                    value={item.description}
                    rows={3}
                    disabled={busy}
                    onChange={(v) => onUpdate({ description: v })}
                    onCopy={() => doCopy("description", item.description)}
                    copied={copied === "description"}
                  />
                ) : null}
                {showKeywords ? (
                  <Field
                    label={`Keywords · ${item.keywords.length}`}
                    value={item.keywords.join(", ")}
                    rows={3}
                    disabled={busy}
                    onChange={(v) =>
                      onUpdate({
                        keywords: v.split(",").map((k) => k.trim()).filter(Boolean),
                      })
                    }
                    onCopy={() => doCopy("keywords", item.keywords.join(", "))}
                    copied={copied === "keywords"}
                  />
                ) : null}
                {showCategory ? (
                  <Field
                    label="Category"
                    value={item.category || ""}
                    rows={1}
                    disabled={busy}
                    onChange={(v) => onUpdate({ category: v })}
                    onCopy={() => doCopy("category", item.category || "")}
                    copied={copied === "category"}
                  />
                ) : null}
                {showPrompt && item.prompt !== undefined ? (
                  <div className="grid grid-cols-[3fr_1fr] gap-2">
                    <Field
                      label="Prompt"
                      value={item.prompt || ""}
                      rows={2}
                      disabled={busy}
                      onChange={(v) => onUpdate({ prompt: v })}
                      onCopy={() => doCopy("fprompt", item.prompt || "")}
                      copied={copied === "fprompt"}
                    />
                    {showBaseModel ? (
                      <Field
                        label="Base-Model"
                        value={item.baseModel || ""}
                        rows={2}
                        disabled={busy}
                        onChange={(v) => onUpdate({ baseModel: v })}
                        onCopy={() => doCopy("bmodel", item.baseModel || "")}
                        copied={copied === "bmodel"}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={() => doCopy("all", metadataToText(item, platform))}
          disabled={busy || item.status !== "done"}
          className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {copied === "all" ? "Copied!" : "Copy All"}
        </button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

function StatusPill({ item }: { item: CardItem }) {
  if (item.status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-2.5 w-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        Done
      </span>
    );
  }
  if (item.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Working
      </span>
    );
  }
  if (item.status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Queued
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400"
      title={item.error}
    >
      Failed
    </span>
  );
}

function Field({
  label,
  value,
  rows,
  disabled,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  rows: number;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
  copied?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
          {label}
        </label>
        <button
          onClick={onCopy}
          disabled={disabled || !value}
          className="text-[11px] font-semibold text-brand hover:underline disabled:opacity-40 shrink-0"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60 resize-y"
      />
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-lg p-1.5 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}
