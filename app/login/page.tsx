import { redirect } from "next/navigation";
import { getAdminStatus } from "@/lib/auth";
import GoogleLoginButton from "@/components/admin/GoogleLoginButton";
import EmailPasswordLogin from "@/components/admin/EmailPasswordLogin";

export const metadata = { title: "Admin Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; code?: string }>;
}) {
  const params = await searchParams;
  // Already signed in as admin? Straight in - unless this is a password
  // recovery link (?code=...), which the client form must consume first.
  const { isAdmin } = await getAdminStatus();
  if (isAdmin && !params.code) redirect(params.next?.startsWith("/") ? params.next : "/");

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface dark:bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Only authorized administrators can access the Admin Panel.
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
