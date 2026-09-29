import GeneratorSettingsForm from "@/components/admin/GeneratorSettingsForm";
import { getGeneratorSettings } from "@/lib/settings";

export const metadata = { title: "Generator Settings" };
export const dynamic = "force-dynamic";

export default async function AdminGeneratorSettingsPage() {
  const settings = await getGeneratorSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold">Generator Settings</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Defaults used by the AI prompt, batch limits and rate limiting.
      </p>
      <div className="mt-6">
        <GeneratorSettingsForm initial={settings} />
      </div>
    </div>
  );
}
