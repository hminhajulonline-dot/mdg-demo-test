import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import EpsToJpgClient from "@/components/tools/EpsToJpgClient";

export const metadata = {
  title: "EPS/AI to JPG Converter",
  description:
    "Convert EPS, AI, PS and PDF vector files to crisp JPGs in your browser — batch mode with ZIP download, powered by Ghostscript WASM.",
};
export const dynamic = "force-dynamic";

export default function EpsToJpgPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <EpsToJpgClient />
      </main>
      <SiteFooter />
    </>
  );
}
