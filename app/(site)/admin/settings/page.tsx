import SiteSettingsForm from "@/components/admin/SiteSettingsForm";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "Site Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSiteSettingsPage() {
  const settings = await getSiteSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold">Site Settings</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Basic information shown across the public website.
      </p>
      <div className="mt-6">
        <SiteSettingsForm initial={settings} />
      </div>
    </div>
  );
}
