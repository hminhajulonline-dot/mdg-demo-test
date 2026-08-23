"use client";

import { useEffect, useState } from "react";
import type { Announcement } from "@/lib/announcement";

/**
 * Dismissible developer banner shown under the header on every page.
 * Content ships from the official repo (announcement.json) and reaches
 * forks via auto-sync. Reappears for everyone when the announcement id
 * changes. Not editable from any Admin Panel.
 */
export default function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setHidden(localStorage.getItem("mmg-ann-seen") === announcement.id);
      } catch {
        setHidden(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [announcement.id]);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem("mmg-ann-seen", announcement.id);
    } catch {}
    setHidden(true);
  }

  const theme = {
    promo: "bg-gradient-to-r from-brand/15 via-brand/10 to-transparent border-brand/30",
    info: "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900/50",
    warning: "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/50",
  }[announcement.theme];

  return (
    <div className={`mm-fade-in border-b ${theme}`}>
      <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3 text-sm">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-white text-[10px] font-bold">
          ✦
        </span>
        <p className="flex-1 min-w-0 leading-snug">
          <span className="font-semibold">{announcement.title}</span>
          {announcement.body ? (
            <span className="text-slate-600 dark:text-slate-400"> — {announcement.body}</span>
          ) : null}
        </p>
        {announcement.linkUrl ? (
          <a
            href={announcement.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
          >
            {announcement.linkLabel || "Learn more"}
          </a>
        ) : null}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
