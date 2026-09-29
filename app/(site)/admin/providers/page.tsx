import ProvidersManager from "@/components/admin/ProvidersManager";
import { resolveProvider } from "@/lib/ai/providers";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "AI Providers" };
export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const settings = await getSiteSettings();
  const hasEnvFallbackKey = !!resolveProvider();

  return (
    <div>
      <h1 className="text-2xl font-bold">AI Providers</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Select which AI providers users can add keys for inside the tool.
        Disabled providers are hidden from the API Keys modal and rejected by
        the generation API.
      </p>
      <div className="mt-6 max-w-3xl">
        <ProvidersManager
          initialEnabled={settings.enabled_providers}
          hasEnvFallbackKey={hasEnvFallbackKey}
        />
      </div>
    </div>
  );
}
