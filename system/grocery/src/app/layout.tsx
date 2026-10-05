import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Cairo } from "next/font/google";
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
        className={`${cairo.variable} ${geistMono.variable} h-full font-sans antialiased`}
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
