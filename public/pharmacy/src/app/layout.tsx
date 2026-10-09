import type { Metadata, Viewport } from "next";
import { Noto_Kufi_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { dirByLocale, LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n";
import "./globals.css";

const kufiArabic = Noto_Kufi_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "الصيدلية | نظام إدارة الصيدليات",
    template: "%s | الصيدلية",
  },
  description:
    "Pharmacy management system for Yemen — medicines, inventory, POS, sales, purchases and accounting. / نظام إدارة متكامل للصيدليات في اليمن.",
  applicationName: "Pharmacy",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1410" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  const dir = dirByLocale[locale];

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${kufiArabic.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Providers locale={locale} dir={dir}>
          {children}
        </Providers>
      </body>
    </html>
  );
}