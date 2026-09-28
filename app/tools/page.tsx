import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import Link from "next/link";
import { TOOLS } from "@/lib/tools/registry";

export const metadata = {
  title: "Tools",
  description: "A growing set of browser-first tools for microstock creators - prompt generation, file conversion, keyword research and more.",
};
export const dynamic = "force-dynamic";

export default function ToolsIndexPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Browser-first utilities for microstock creators — no uploads to unknown servers, your API
            keys stay on your device.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => {
              const card = (
                <div
                  className={`flex h-full flex-col rounded-2xl border p-5 transition-colors ${
                    tool.status === "live"
                      ? "border-slate-200 bg-surface hover:border-brand/60 dark:border-slate-800"
                      : "border-dashed border-slate-300 opacity-70 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
                      </svg>
                    </span>
                    {tool.status === "soon" ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-800">
                        Coming soon
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                        Live
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-lg font-bold">{tool.title}</h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {tool.description}
                  </p>
                  {tool.status === "live" ? (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                      Open tool
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  ) : null}
                </div>
              );

              return tool.status === "live" ? (
                <Link key={tool.slug} href={tool.href} className="block">
                  {card}
                </Link>
              ) : (
                <div key={tool.slug}>{card}</div>
              );
            })}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
