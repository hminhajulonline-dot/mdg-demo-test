"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rendered by the (site) layout whenever a signed-out visitor opens a
 * tool page. Keeps the visitor on the requested URL and deep-links the
 * login form back here via ?next=.
 */
export default function LoginRequired() {
  const pathname = usePathname();
  const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-7 w-7">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-bold">Login Required</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This tool is available to authorized accounts only. Sign in to continue
          {pathname && pathname !== "/" ? ` to ${pathname}` : ""}.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/login${next}`}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
