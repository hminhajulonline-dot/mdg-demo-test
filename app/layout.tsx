import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSiteSettings } from "@/lib/settings";
import { assertLicenseIntegrity } from "@/lib/core/license";
import RouteProgress from "@/components/branding/RouteProgress";
import "./globals.css";

// Core integrity check - the site refuses to render when the required
// Plickify attribution has been tampered with.
assertLicenseIntegrity();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * Every page renders per-request so Admin Panel changes (site name, logo,
 * favicon, colors, theme) appear immediately - nothing is cached stale.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: {
      default: `${s.site_name} - ${s.site_description}`,
      template: `%s | ${s.site_name}`,
    },
    description: s.site_description,
    icons: s.favicon_url
      ? {
          icon: s.favicon_url,
          shortcut: s.favicon_url,
          apple: s.favicon_url,
        }
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();

  const themeScript = `
(function(){
  try {
    var dflt = ${JSON.stringify(settings.theme_mode)};
    var stored = localStorage.getItem("mmg-theme");
    var mode = stored || dflt;
    if (mode === "system") {
      mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (mode === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          "--brand": settings.primary_color,
          "--brand-secondary": settings.secondary_color,
        } as React.CSSProperties
      }
      data-theme-default={settings.theme_mode}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}
