import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminStatus } from "@/lib/auth";
import AdminLogout from "@/components/admin/AdminLogout";
import AdminSidebar from "@/components/admin/AdminSidebar";
export const metadata = { title: "Admin" };

/**
 * Server-side guard for every /admin route. Unauthenticated visitors are
 * redirected to login; authenticated non-admins see Access Denied.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = await getAdminStatus();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!isAdmin) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-8 text-center">
          <h1 className="text-2xl font-bold text-red-700 dark:text-red-300">Access Denied</h1>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Your account ({user.email}) is not authorized as an admin. If you
            believe this is a mistake, add your user to the{" "}
            <code className="px-1 rounded bg-red-100 dark:bg-red-900">admin_users</code>{" "}
            table (see README).
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              Back to site
            </Link>
            <AdminLogout compact />
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex-1 flex min-h-[calc(100vh-4rem)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 p-4 gap-4 sticky top-16 self-start h-[calc(100vh-4rem)]">
        <div>
          <p className="px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Admin Panel
          </p>
        </div>
        <AdminSidebar />
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            View Site
          </Link>
          <AdminLogout />
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-background/95 backdrop-blur p-2 overflow-x-auto">
        <div className="flex gap-1 w-max">
          {[
            "/admin",
            "/admin/settings",
            "/admin/content",
            "/admin/branding",
            "/admin/theme",
            "/admin/generator",
            "/admin/providers",
            "/admin/admins",
            "/admin/usage",
          ].map((href) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium"
            >
              {href === "/admin" ? "Dashboard" : href.replace("/admin/", "")}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-x-hidden pb-24 md:pb-8 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
      </div>
    </div>
  );
}
