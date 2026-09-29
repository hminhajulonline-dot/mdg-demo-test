import ThemeForm from "@/components/admin/ThemeForm";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "Theme" };
export const dynamic = "force-dynamic";

export default async function AdminThemePage() {
  const settings = await getSiteSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold">Theme</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Default theme mode (Light / Dark / System) and brand colors. Visitors
        can still override the mode locally from the header toggle.
      </p>
      <div className="mt-6">
        <ThemeForm initial={settings} />
      </div>
    </div>
  );
}
