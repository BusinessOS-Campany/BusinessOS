import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Cairo, Tajawal, IBM_Plex_Sans_Arabic, Almarai } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ZodLocale } from "@/components/zod-locale";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { appHref } from "@/lib/app-url";
import { dict } from "@/shared/i18n";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Appearance-picker alternatives. Only one of these is ever active, so they are
// registered with preload:false — otherwise every visit pays a font download
// for a face the store probably never selects. appearanceStyleSheet() rebinds
// --font-sans to the chosen --font-* variable.
const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  // This Next version's font manifest does not treat this family as variable,
  // so weight is required rather than inferred.
  weight: ["400", "500", "600", "700"],
  preload: false,
});

const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  preload: false,
});

const optionalFontVariables = [tajawal, plexArabic, almarai]
  .map((f) => f.variable)
  .join(" ");

/**
 * Where this system is mounted, matching `basePath` in `next.config.ts`.
 *
 * Next prefixes the `manifest` link it generates but not the icon URLs in a
 * `generateMetadata` result, and not the body of `app/manifest.ts`. Left
 * root-absolute they 404 for every org, which is what made the installed copy
 * report missing icons and an invalid manifest image.
 */
const basePath = process.env.SYSTEM_BASE_PATH ?? "/grocery";

export async function generateMetadata(): Promise<Metadata> {
  const t = dict();
  return {
    title: `${t.auth.storeName} — ${t.common.appName}`,
    description: "Grocery store management system / نظام إدارة متجر البقالة",
    manifest: appHref("/manifest.webmanifest", basePath),
    applicationName: t.common.appName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t.common.appName,
    },
    icons: {
      icon: [
        { url: appHref("/icons/icon-192.png", basePath), sizes: "192x192", type: "image/png" },
        { url: appHref("/icons/icon-512.png", basePath), sizes: "512x512", type: "image/png" },
      ],
      apple: appHref("/icons/apple-touch-icon.png", basePath),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${geistMono.variable} ${optionalFontVariables} h-full font-sans antialiased`}
      >
        <ThemeProvider>
          <PwaRegister />
          <ZodLocale />
          {children}
          <Toaster position="bottom-left" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
