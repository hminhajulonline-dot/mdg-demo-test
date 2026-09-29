import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import AdobeTrackerClient from "@/components/tools/AdobeTrackerClient";
import { getTrackerSettings } from "@/lib/adobe-tracker/service";

export const metadata = {
  title: "Adobe Tracker",
  description:
    "Search any keyword or track any contributor on Adobe Stock — real per-asset download counts, views, categories and keywords.",
};
export const dynamic = "force-dynamic";

export default async function AdobeTrackerPage() {
  const settings = await getTrackerSettings();
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <AdobeTrackerClient settings={settings} />
      </main>
      <SiteFooter />
    </>
  );
}
