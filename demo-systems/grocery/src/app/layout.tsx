import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Cairo, Tajawal, IBM_Plex_Sans_Arabic, Almarai } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ZodLocale } from "@/components/zod-locale";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = dict();
  return {
    title: `${t.auth.storeName} — ${t.common.appName}`,
    description: "Grocery store management system / نظام إدارة متجر البقالة",
    manifest: "/manifest.webmanifest",
    applicationName: t.common.appName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t.common.appName,
    },
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png",
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
