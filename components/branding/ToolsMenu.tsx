"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TOOLS } from "@/lib/tools/registry";

/**
 * Header "Tools" dropdown - same open/close pattern as DeveloperMenu.
 */
export default function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`hidden items-center gap-1 rounded-lg px-3 py-2 font-medium transition-colors sm:inline-flex ${
          open ? "bg-brand/10 text-brand" : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        Tools
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Compact icon button for small screens */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Tools"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors sm:hidden ${
          open
            ? "border-brand bg-brand/10"
            : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-4 w-4 ${open ? "text-brand" : "text-slate-500 dark:text-slate-400"}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      </button>

      {open ? (
        <div className="mm-pop-in absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-2xl dark:border-slate-800">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Tools</p>
            <p className="text-xs font-semibold">Browse all tools</p>
          </div>
          <div className="space-y-0.5 p-2">
            {TOOLS.map((tool) => {
              const inner = (
                <>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{tool.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">{tool.short}</span>
                  </span>
                  {tool.status === "soon" ? (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400 dark:bg-slate-800">
                      Soon
                    </span>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0 text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  )}
                </>
              );

              if (tool.status !== "live") {
                return (
                  <span
                    key={tool.slug}
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2 opacity-60"
                    title="Coming soon"
                  >
                    {inner}
                  </span>
                );
              }
              return (
                <Link
                  key={tool.slug}
                  href={tool.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-brand/5"
                >
                  {inner}
                </Link>
              );
            })}
            <Link
              href="/tools"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl border-t border-slate-100 px-3 pt-2.5 pb-2 text-xs font-semibold text-brand hover:bg-brand/5 dark:border-slate-800"
            >
              View all tools →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
