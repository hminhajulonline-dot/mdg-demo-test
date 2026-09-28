/**
 * Registry of the bundled tools - shared by /tools index, the header
 * Tools dropdown and future admin tool settings.
 */

export interface ToolDef {
  slug: string;
  href: string;
  title: string;
  short: string;
  description: string;
  status: "live" | "soon";
  /** Heroicon-style path for the dropdown/index icon. */
  icon: string;
}

export const TOOLS: ToolDef[] = [
  {
    slug: "prompt-generator",
    href: "/tools/prompt-generator",
    title: "Prompt Generator",
    short: "Prompt Generator",
    description:
      "Turn keywords + reference images into stock-safe, AI-polished prompts with IP checks and TXT/CSV export.",
    status: "live",
    icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
  },
  {
    slug: "eps-to-jpg",
    href: "/tools/eps-to-jpg",
    title: "EPS/AI to JPG",
    short: "EPS/AI → JPG",
    description:
      "Convert EPS, AI, PS and PDF files to crisp JPGs in your browser — batch mode with ZIP download.",
    status: "live",
    icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 12h.008v.008H18V12Zm-15 3.75V16.5A2.25 2.25 0 0 0 5.25 18.75h13.5A2.25 2.25 0 0 0 21 16.5v-1.5m-18 0V6A2.25 2.25 0 0 1 5.25 3.75h13.5A2.25 2.25 0 0 1 21 6v9.75m-18 0h18",
  },
  {
    slug: "converter",
    href: "/tools/converter",
    title: "File Converter",
    short: "File Converter",
    description:
      "Convert images, PDFs and more between formats — plus smart compression, entirely in your browser.",
    status: "live",
    icon: "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  },
  {
    slug: "adobe-tracker",
    href: "/tools/adobe-tracker",
    title: "Adobe Tracker",
    short: "Adobe Tracker",
    description:
      "Track trending keywords and search demand on Adobe Stock to plan your next submissions.",
    status: "live",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  },
];
