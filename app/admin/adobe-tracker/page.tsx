import AdobeTrackerAdmin from "@/components/admin/AdobeTrackerAdmin";

export const metadata = { title: "Adobe Tracker" };
export const dynamic = "force-dynamic";

export default function AdminAdobeTrackerPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Adobe Tracker</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Configure who can search, the shared daily quota and the site API key pool that serves
        the tool. Keys rotate with automatic failover and never reach the browser.
      </p>
      <div className="mt-6 max-w-3xl space-y-6">
        <AdobeTrackerAdmin />
      </div>
    </div>
  );
}
