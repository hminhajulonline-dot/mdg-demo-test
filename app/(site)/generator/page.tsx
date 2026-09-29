import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import GeneratorWorkbench from "@/components/generator/GeneratorWorkbench";
import { getGeneratorSettings, getSiteSettings } from "@/lib/settings";

export const metadata = {
  title: "AI Metadata Generator",
  description: "Upload images and generate titles, descriptions, keywords and categories instantly.",
};

/**
 * Full-width tool layout: controls docked hard-left for the whole
 * viewport height, metadata cards filling the remaining space.
 */
export default async function GeneratorPage() {
  const [settings, siteSettings] = await Promise.all([
    getGeneratorSettings(),
    getSiteSettings(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 lg:flex lg:min-h-[calc(100vh-4rem)]">
        <GeneratorWorkbench
          settings={settings}
          enabledProviders={siteSettings.enabled_providers}
        />
      </main>
      <SiteFooter />
    </>
  );
}
