import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import ThemeToggle from "@/components/branding/ThemeToggle";
import UserProfile from "@/components/branding/UserProfile";
import HealthBadge from "@/components/branding/HealthBadge";
import DeveloperMenu from "@/components/branding/DeveloperMenu";
import UpdateBell from "@/components/branding/UpdateBell";
import AnnouncementBanner from "@/components/branding/AnnouncementBanner";
import { getAdminStatus } from "@/lib/auth";
import { DEVELOPER } from "@/lib/core/license";
import { LATEST_UPDATE } from "@/lib/updates";
import { ANNOUNCEMENT } from "@/lib/announcement";

export default async function SiteHeader() {
  const [s, { isAdmin }] = await Promise.all([getSiteSettings(), getAdminStatus()]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          {s.logo_url ? (
            // Logos live in the user's own Supabase Storage domain, which is
            // only known at runtime - plain <img> avoids remotePatterns config.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={s.logo_url}
              alt={s.site_name}
              className="h-8 w-auto max-w-[140px] object-contain"
            />
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold">
              {s.site_name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-semibold truncate">{s.site_name}</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3 text-sm">
          <Link
            href="/community"
            className="hidden sm:inline-flex rounded-lg px-3 py-2 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Community
          </Link>
          <ThemeToggle />
          <HealthBadge />
          {LATEST_UPDATE ? (
            <UpdateBell
              latestVersion={LATEST_UPDATE.version}
              latestTitle={LATEST_UPDATE.title}
            />
          ) : null}
          <DeveloperMenu
            dev={{
              name: DEVELOPER.name,
              website: DEVELOPER.website,
              facebook: DEVELOPER.facebook,
            }}
          />
          <UserProfile isAdmin={isAdmin} />
        </nav>
      </div>
      {ANNOUNCEMENT ? <AnnouncementBanner announcement={ANNOUNCEMENT} /> : null}
    </header>
  );
}
