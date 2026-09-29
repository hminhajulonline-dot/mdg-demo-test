import { getAdminStatus } from "@/lib/auth";
import LoginRequired from "@/components/auth/LoginRequired";
import AdminRequired from "@/components/auth/AdminRequired";

/**
 * Auth gate for every non-public page (generator, tools, community,
 * updates, admin). Renders self-contained screens instead of bouncing
 * through /login:
 *   - signed out          -> "Login Required" (deep-links back after sign-in)
 *   - signed in, non-admin -> "Admin Required"
 *
 * The marketing home page, /login and /auth/callback live OUTSIDE this
 * group and stay public.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = await getAdminStatus();

  if (!user) return <LoginRequired />;
  if (!isAdmin) return <AdminRequired email={user.email} />;

  return <>{children}</>;
}
