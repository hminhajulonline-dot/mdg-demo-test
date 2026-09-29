import PageContentForm from "@/components/admin/PageContentForm";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "Page Content" };
export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  const settings = await getSiteSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold">Page Content</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Every public page section - hero, feature cards, steps and the About
        page - editable without touching code.
      </p>
      <div className="mt-6">
        <PageContentForm initial={settings} />
      </div>
    </div>
  );
}
