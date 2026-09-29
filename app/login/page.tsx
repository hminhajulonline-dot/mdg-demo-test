import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminStatus } from "@/lib/auth";
import GoogleLoginButton from "@/components/admin/GoogleLoginButton";
import EmailPasswordLogin from "@/components/admin/EmailPasswordLogin";
import AdminLogout from "@/components/admin/AdminLogout";

export const metadata = { title: "Admin Login" };

/** Never bounce back to /login itself, and only allow local paths. */
function safeNext(next?: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("/login")) return "/";
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; code?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const { user, isAdmin } = await getAdminStatus();

  // Already signed in as admin? Straight in - unless this is a password
  // recovery link (?code=...), which the client form must consume first.
  if (isAdmin && !params.code) redirect(next);

  // Signed in but NOT an admin (e.g. Google login): tell them plainly
  // instead of showing a form they could never get past.
  if (user && !isAdmin && !params.code) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-8 text-center">
          <h1 className="text-2xl font-bold text-red-700 dark:text-red-300">
            Admin Required
          </h1>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            You are signed in as <span className="font-semibold">{user.email}</span>,
            but this account is not authorized as an admin. Ask the site
            administrator to add you, or sign out and use another account.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              Back to home
            </Link>
            <AdminLogout compact />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {next !== "/"
            ? "Sign in to continue to the page you requested."
            : "Only authorized administrators can access this site."}
        </p>

        {params.error ? (
          <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
            {params.error === "missing_code"
              ? "Login was cancelled or the link expired. Please try again."
              : decodeURIComponent(params.error)}
          </p>
        ) : null}

        <EmailPasswordLogin next={params.next} />

        <div className="mt-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">or</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <GoogleLoginButton next={params.next} />

        <p className="mt-6 text-xs text-slate-500 dark:text-slate-500">
          Site access is restricted to authorized administrators.
        </p>
      </div>
    </main>
  );
}
