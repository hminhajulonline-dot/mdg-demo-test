import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface LogRow {
  id: number;
  created_at: string;
  filename: string | null;
  success: boolean;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  title_length: number | null;
  keyword_count: number | null;
  error_message: string | null;
}

async function loadUsage(): Promise<{
  rows: LogRow[];
  total: number;
  today: number;
  failed7d: number;
  error: boolean;
}> {
  try {
    const admin = createAdminClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [rows, total, today, failed] = await Promise.all([
      admin
        .from("usage_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
      admin.from("usage_logs").select("id", { count: "exact", head: true }),
      admin
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgo),
      admin
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("success", false)
        .gte("created_at", weekAgo),
    ]);

    if (rows.error || total.error || today.error || failed.error) {
      throw new Error(rows.error?.message ?? "query failed");
    }

    return {
      rows: (rows.data ?? []) as unknown as LogRow[],
      total: total.count ?? 0,
      today: today.count ?? 0,
      failed7d: failed.count ?? 0,
      error: false,
    };
  } catch {
    return { rows: [], total: 0, today: 0, failed7d: 0, error: true };
  }
}

export default async function AdminUsagePage() {
  const { rows, total, today, failed7d, error } = await loadUsage();

  return (
    <div>
      <h1 className="text-2xl font-bold">Usage</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        System-level generation log (latest {PAGE_SIZE} shown). No personal
        data is stored.
      </p>

      {/* Stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="All-time generations" value={total.toLocaleString()} />
        <Stat label="Last 24 hours" value={today.toLocaleString()} />
        <Stat
          label="Failures (7 days)"
          value={failed7d.toLocaleString()}
          tone={failed7d > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-surface dark:bg-surface text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">File</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
              <th className="px-4 py-3 font-semibold">Title / Keywords</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Could not load logs. Make sure migration{" "}
                  <code>0004_usage_logs.sql</code> has been run.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No generations logged yet. Generate something in the tool and
                  refresh this page.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} title={row.error_message || undefined}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500" suppressHydrationWarning>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate">{row.filename || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        row.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-red-600 dark:text-red-400 font-medium"
                      }
                    >
                      {row.success ? "OK" : "Error"}
                    </span>
                    {!row.success && row.error_message ? (
                      <span className="block max-w-[220px] truncate text-xs text-slate-400">
                        {row.error_message}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {row.provider ? `${row.provider}${row.model ? ` · ${row.model}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {row.title_length != null ? `${row.title_length} chars` : "—"} /{" "}
                    {row.keyword_count != null ? `${row.keyword_count} kw` : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Need the raw data? Export via Supabase → Table Editor → usage_logs.
      </p>

      <Link href="/generator" className="mt-2 inline-block text-sm text-brand hover:underline">
        Open Generator →
      </Link>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-xl font-bold ${
          tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
