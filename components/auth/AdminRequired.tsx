import Link from "next/link";
import AdminLogout from "@/components/admin/AdminLogout";

/**
 * Rendered by the (site) layout for signed-in accounts that are not on
 * the admin_users list - no tool, page or API opens for them.
 */
export default function AdminRequired({ email }: { email?: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-8 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-7 w-7">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-bold text-red-700 dark:text-red-300">
          Admin Required
        </h1>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {email ? (
            <>
              The account <span className="font-semibold">{email}</span> is signed in
              but is not authorized as an admin.{" "}
            </>
          ) : (
            "Your account is not authorized as an admin. "
          )}
          Ask the site administrator to add you, then sign in again.
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
