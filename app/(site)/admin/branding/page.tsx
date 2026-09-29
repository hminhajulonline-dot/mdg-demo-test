import BrandingForm from "@/components/admin/BrandingForm";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "Branding" };
export const dynamic = "force-dynamic";

export default async function AdminBrandingPage() {
  const settings = await getSiteSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold">Branding</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Logo, favicon and brand colors. Files upload to your Supabase Storage
        (public <code>branding-assets</code> bucket).
      </p>
      <div className="mt-6">
        <BrandingForm initial={settings} />
      </div>
    </div>
  );
}
