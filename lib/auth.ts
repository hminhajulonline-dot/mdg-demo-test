import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface AdminCheckResult {
  user: {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  } | null;
  isAdmin: boolean;
}

/**
 * Cache tag for admin_users row lookups. Every mutation route revalidates
 * it (revalidateTag) so promote/disable/remove take effect immediately.
 */
export const ADMIN_USERS_TAG = "admin-users";

/**
 * Read (and bootstrap) the admin_users row, cached for 60s per user so
 * SiteHeader on EVERY page no longer costs a database roundtrip. Thrown
 * errors propagate uncached so a transient DB failure never gets pinned.
 */
const readAdminRow = unstable_cache(
  async (userId: string, email: string): Promise<boolean> => {
    let isAdmin = false;

    // Prefer the optional bootstrap allowlist (ADMIN_EMAIL env var) so the
    // very first admin can sign in before any DB row exists.
    const bootstrapEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (bootstrapEmail && email.toLowerCase() === bootstrapEmail) {
      isAdmin = true;
      await ensureAdminRow(userId, email);
    }

    if (!isAdmin) {
      const admin = createAdminClient();
      const { data: rows, error } = await admin
        .from("admin_users")
        .select("status")
        .eq("user_id", userId)
        .limit(1);
      if (error) throw error;
      isAdmin = !!rows?.[0] && rows[0].status === "active";
    }

    return isAdmin;
  },
  ["admin-row"],
  { revalidate: 60, tags: [ADMIN_USERS_TAG] }
);

/**
 * Full server-side authorization: authenticated Supabase session AND an
 * active row in admin_users. Used by the (site) gate layout, SiteHeader,
 * the admin layout and every admin API route. Never rely on client-side
 * checks alone.
 *
 * Wrapped in React cache() so the header and layout share ONE check per
 * request. The session cookie itself was already validated by the proxy
 * (updateSession -> getUser or warm-path memo), so reading it locally
 * here avoids a second network roundtrip.
 */
export const getAdminStatus = cache(async (): Promise<AdminCheckResult> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    const user = error ? null : data.session?.user ?? null;
    if (!user) return { user: null, isAdmin: false };

    const email = user.email ?? "";
    const isAdmin = await readAdminRow(user.id, email);

    return { user: { id: user.id, email }, isAdmin };
  } catch {
    // Misconfigured environment - fail closed.
    return { user: null, isAdmin: false };
  }
});

/** Best-effort upsert of the bootstrap admin row so it appears in the DB. */
async function ensureAdminRow(userId: string, email: string) {
  try {
    const admin = createAdminClient();
    await admin.from("admin_users").upsert(
      {
        user_id: userId,
        email,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Non-fatal.
  }
}
