import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getDictAndDir } from "@/core/i18n/server";
import { ThemeProvider } from "@/components/theme-provider";
import CustomCursor from "@/components/landing/custom-cursor";

export const metadata: Metadata = {
  title: "Business OS",
  description:
    "Multi-tenant white-label business management platform — نظام إدارة الأعمال متعدد المستأجرين",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BOS",
  },
};

export const viewport: Viewport = {
  themeColor: "#0263D1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getDictAndDir();
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        {/* Theme bootstrap, hoisted and executed before first paint.
            An inline <script> here is neutralised by React 19 on any client
            re-render ("Encountered a script tag while rendering React
            component"), and it is load-bearing: dark mode is a class-based
            variant, not a prefers-color-scheme query, so nothing covers a late
            or skipped script. `async` + `src` is the shape React hoists. */}
        <script async src="/theme-init.js" />
        {/*
          A service worker installed by an earlier production build keeps
          controlling the page during `next dev` and answers for hashed chunks
          that this dev server never produced, so the app 404s on its own
          JavaScript. Serwist is disabled in development, so nothing here
          registers a replacement — the only correct dev state is none at all.
          External file, not an inline script: React 19 neutralises inline
          scripts in <head> on client re-render (see the note above).
        */}
        {process.env.NODE_ENV === "development" ? <script async src="/sw-dev-reset.js" /> : null}
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <CustomCursor>{children}</CustomCursor>
        </ThemeProvider>
      </body>
    </html>
  );
}
