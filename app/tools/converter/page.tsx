import SiteHeader from "@/components/branding/SiteHeader";
import SiteFooter from "@/components/branding/SiteFooter";
import ConverterClient from "@/components/tools/ConverterClient";

export const metadata = {
  title: "File Converter",
  description:
    "Convert images between PNG, JPG, WebP and BMP, merge images into a PDF, split a PDF into images, or compress images — all in your browser.",
};
export const dynamic = "force-dynamic";

export default function ConverterPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <ConverterClient />
      </main>
      <SiteFooter />
    </>
  );
}
