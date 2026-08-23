import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import Link from "next/link";
import { COMMUNITY_POSTS } from "@/lib/community";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight">Community</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Marketplace news, platform updates and tips - posted by the team.
          </p>

          <div className="mt-10 space-y-5">
            {COMMUNITY_POSTS.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No posts yet. Check back soon!
                </p>
                <Link
                  href="/generator"
                  className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open Generator
                </Link>
              </div>
            ) : (
              COMMUNITY_POSTS.map((post) => {
                const paragraphs = post.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
                const dateLabel = post.date
                  ? new Date(post.date + "T00:00:00").toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })
                  : null;

                return (
                  <article
                    key={post.id}
                    className={`rounded-2xl border bg-surface dark:bg-surface p-5 sm:p-6 ${
                      post.pinned ? "border-brand/50 shadow-sm" : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {post.pinned ? (
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 font-bold uppercase tracking-wider text-brand">
                          Pinned
                        </span>
                      ) : null}
                      {dateLabel ? <span className="text-slate-400">{dateLabel}</span> : null}
                    </div>
                    <h2 className="mt-2 text-lg font-bold">{post.title}</h2>
                    <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {paragraphs.map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                    {post.linkUrl ? (
                      <a
                        href={post.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                      >
                        {post.linkLabel || "Read more"}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          {/* Changelog cross-link */}
          <div className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Curious what changed in the tool itself?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Releases, bug fixes and migration notes live in the changelog.
              </p>
            </div>
            <Link
              href="/updates"
              className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              View changelog →
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
