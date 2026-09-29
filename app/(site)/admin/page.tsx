import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteSettings } from "@/lib/settings";
import versionFile from "../../../version.json";

export const metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

interface UsageRow {
  created_at: string;
  success: boolean;
  filename: string | null;
  provider: string | null;
  model: string | null;
  error_message: string | null;
}

async function loadStats() {
  try {
    const admin = createAdminClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [total, today, recent] = await Promise.all([
      admin.from("usage_logs").select("id", { count: "exact", head: true }),
      admin
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgo),
      admin
        .from("usage_logs")
        .select("created_at,success,filename,provider,model,error_message")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    return {
      total: total.count ?? 0,
      today: today.count ?? 0,
      recent: (recent.data ?? []) as unknown as UsageRow[],
    };
  } catch {
    return { total: 0, today: 0, recent: [] as UsageRow[] };
  }
}

export default async function AdminDashboardPage() {
  const [{ total, today, recent }, site] = await Promise.all([
    loadStats(),
    getSiteSettings(),
  ]);

  const version = versionFile?.version || "unknown";

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Generations" value={total.toLocaleString()} />
        <StatCard label="Last 24 Hours" value={today.toLocaleString()} />
        <StatCard label="Version" value={version} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h2 className="font-semibold">Current Site</h2>
          <dl className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex justify-between gap-3">
              <dt>Site name</dt>
              <dd className="font-medium text-right truncate">{site.site_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Primary color</dt>
              <dd className="font-medium flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ background: site.primary_color }} />
                {site.primary_color}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Theme</dt>
              <dd className="font-medium capitalize">{site.theme_mode}</dd>
            </div>
          </dl>
          <Link
            href="/admin/settings"
            className="mt-4 inline-block text-sm font-medium text-brand hover:underline"
          >
            Edit settings →
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h2 className="font-semibold">Quick Links</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["/admin/settings", "Site Settings"],
              ["/admin/branding", "Branding & Logo"],
              ["/admin/theme", "Theme & Colors"],
              ["/admin/generator", "Generator Settings"],
              ["/admin/usage", "Usage Logs"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-brand hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent Generations</h2>
          <Link href="/admin/usage" className="text-sm text-brand hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No generations logged yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {recent.map((row, i) => (
              <li key={i} className="py-2 flex items-center justify-between gap-3">
                <span className="truncate font-medium">{row.filename || "—"}</span>
                <span className="shrink-0 flex items-center gap-2 text-xs text-slate-500">
                  {row.provider ? <span>{row.provider}</span> : null}
                  <span
                    className={
                      row.success
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {row.success ? "OK" : "ERR"}
                  </span>
                  <span suppressHydrationWarning>
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
