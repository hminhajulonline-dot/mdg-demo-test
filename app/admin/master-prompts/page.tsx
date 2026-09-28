import MasterPromptsManager from "@/components/admin/MasterPromptsManager";

export const metadata = { title: "Master Prompts" };
export const dynamic = "force-dynamic";

export default function AdminMasterPromptsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Master Prompts</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Manage the interactive prompt templates behind the Prompt Generator&apos;s Auto Engine.
        Active prompts appear in the tool&apos;s picker.
      </p>
      <div className="mt-6 max-w-3xl">
        <MasterPromptsManager />
      </div>
    </div>
  );
}
