import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import PromptGeneratorClient from "@/components/tools/PromptGeneratorClient";

export const metadata = {
  title: "Microstock Prompt Generator",
  description:
    "Turn keywords and reference images into stock-safe, AI-polished image prompts — raster or vector, with IP checks and TXT/CSV export.",
};
export const dynamic = "force-dynamic";

export default function PromptGeneratorPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PromptGeneratorClient />
      </main>
      <SiteFooter />
    </>
  );
}
