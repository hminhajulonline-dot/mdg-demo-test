import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import AutoEngineClient from "@/components/tools/AutoEngineClient";

export const metadata = {
  title: "Prompt Generator — Auto Engine",
  description:
    "Guided Auto Engine: pick a master prompt, answer step-by-step questions with buttons, and get full-length production-ready microstock prompts one by one.",
};
export const dynamic = "force-dynamic";

export default function PromptGeneratorAutoPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <AutoEngineClient />
      </main>
      <SiteFooter />
    </>
  );
}
