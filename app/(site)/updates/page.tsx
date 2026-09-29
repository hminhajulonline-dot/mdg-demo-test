import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import { UPDATES, type SiteUpdate } from "@/lib/updates";

export const metadata = { title: "Updates & Changelog" };
export const dynamic = "force-dynamic";

const TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  release: { label: "Release", cls: "bg-brand/15 text-brand" },
  feature: { label: "Feature", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  bugfix: { label: "Bug fixes", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  docs: { label: "Docs", cls: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export default function UpdatesPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight">Updates &amp; Changelog</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Every release, bug fix and required action - newest first. This list
            ships with the code, so forked sites see the same timeline
            automatically after each auto-sync.
          </p>

          <div className="mt-10 space-y-8">
            {UPDATES.map((u) => (
              <UpdateEntry key={u.version} u={u} />
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function UpdateEntry({ u }: { u: SiteUpdate }) {
  const type = TYPE_STYLES[u.type] ?? TYPE_STYLES.docs;
  const dateLabel = new Date(u.date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 pt-5 pb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${type.cls}`}>
              {type.label}
            </span>
            <span className="text-xs font-semibold text-slate-400">v{u.version}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-400">{dateLabel}</span>
            {u.migrationRequired ? (
              <span className="rounded-full bg-red-100 dark:bg-red-950/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                SQL needed
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 font-bold">{u.title}</h2>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 sm:px-6 py-4 space-y-4 text-sm">
        {u.changes.length > 0 ? (
          <Section title="What's new">
            <ul className="space-y-1.5 list-disc list-outside ml-4">
              {u.changes.map((c, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-400 leading-relaxed">{c}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {u.bugfixes.length > 0 ? (
          <Section title="Bug fixes">
            <ul className="space-y-1.5 list-disc list-outside ml-4">
              {u.bugfixes.map((c, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-400 leading-relaxed">{c}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {u.migrations.length > 0 ? (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Migration files in this update
            </p>
            <ul className="space-y-1">
              {u.migrations.map((m) => (
                <li key={m}>
                  <code className="text-xs bg-slate-950 text-emerald-300 rounded px-1.5 py-0.5">
                    supabase/migrations/{m}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {u.action ? (
          <div className={`rounded-xl p-4 text-sm leading-relaxed ${
            u.migrationRequired
              ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40"
              : "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40"
          }`}>
            <p className={`font-bold mb-1 ${u.migrationRequired ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"}`}>
              {u.migrationRequired ? "Action required" : "Good to know"}
            </p>
            <p className={u.migrationRequired ? "text-red-700 dark:text-red-200/90" : "text-blue-800 dark:text-blue-200/90"}>
              {u.action}
            </p>
          </div>
        ) : null}

        {!u.changes.length && !u.bugfixes.length && !u.action ? (
          <p className="text-slate-500 dark:text-slate-400">Maintenance release.</p>
        ) : null}
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{title}</p>
      {children}
    </div>
  );
}
