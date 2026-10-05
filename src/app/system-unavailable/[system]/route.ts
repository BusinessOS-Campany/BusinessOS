import { getDemoSystem } from "@/core/demo/demo-systems";
import { unstable_noStore } from "next/cache";

/**
 * Shown instead of a demo system that has no upstream to proxy to.
 *
 * The platform reverse-proxies each demo system same-origin. When a system's
 * source folder is not in this workspace and no URL was configured for it, the
 * proxy target is a port with nothing listening, and Next answers every request
 * with a 500. A page that says exactly what is missing is the honest answer —
 * and it is the difference between "one system is not installed" and "the site
 * is broken".
 *
 * Answers 200: the request itself succeeded, and a non-2xx here would make
 * crawlers and the browser treat a working page as an error.
 */
export const dynamic = "force-dynamic";

const TITLES: Record<string, { ar: string; en: string }> = {
  grocery: { ar: "نظام البقالة", en: "Grocery Store" },
  sama: { ar: "مركز سما الطبي", en: "Sama Medical Center" },
  cafe: { ar: "نظام المقاهي (سيليا)", en: "Café System (Celia)" },
  hospital: { ar: "نظام إدارة المستشفيات", en: "Hospital Management" },
  dental: { ar: "نظام عيادة الأسنان", en: "Dental Clinic" },
  laboratory: { ar: "نظام المختبر", en: "Laboratory System" },
  pharmacy: { ar: "نظام الصيدلية", en: "Pharmacy System" },
  pos: { ar: "نظام نقاط البيع", en: "POS System" },
  optometry: { ar: "نظام عيادة العيون", en: "Optometry Clinic" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ system: string }> },
): Promise<Response> {
  unstable_noStore();
  const { system: slug } = await context.params;
  const system = getDemoSystem(slug);
  const title = TITLES[slug] ?? { ar: "هذا النظام", en: "This system" };

  const arabic = isArabic(request);
  const name = system ? (arabic ? title.ar : title.en) : title.en;

  const copy = arabic
    ? {
        heading: "هذا النظام غير مثبّت على هذا الخادم",
        body: "مصادر هذا النظام غير موجودة في مساحة عمل الخادم، لذلك لا يمكن تشغيله الآن. بقية النظام تعمل بشكل طبيعي.",
        back: "العودة إلى الأنظمة",
        home: "الصفحة الرئيسية",
      }
    : {
        heading: "This system is not installed on this server",
        body: "This system's source is not present in the server workspace, so it cannot be run right now. Everything else on the platform is working normally.",
        back: "Back to systems",
        home: "Home",
      };

  const html = `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(name)} — Business OS</title>
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #12325c 0%, #0a1424 55%, #060b14 100%);
    color: #e8eef8;
  }
  main {
    max-width: 560px; width: 100%; text-align: center;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
    border-radius: 20px; padding: 40px 32px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 24px 60px rgba(0,0,0,.45);
  }
  .badge {
    display: inline-block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
    color: #7dd3fc; background: rgba(125,211,252,.1);
    border: 1px solid rgba(125,211,252,.25); border-radius: 999px; padding: 5px 12px;
  }
  h1 { font-size: 20px; font-weight: 600; margin: 20px 0 10px; color: #f8fafc; }
  p  { font-size: 15px; line-height: 1.7; margin: 0 0 28px; color: #9fb0c8; }
  nav { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  a {
    text-decoration: none; font-size: 14px; font-weight: 500; border-radius: 10px; padding: 10px 18px;
    border: 1px solid rgba(255,255,255,.14); color: #cbd5e1; transition: background .15s, border-color .15s;
  }
  a:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.28); }
  a.primary { background: #1e40af; border-color: #3b82f6; color: #fff; }
  a.primary:hover { background: #1d4ed8; }
</style>
</head>
<body>
  <main>
    <span class="badge">${escapeHtml(name)}</span>
    <h1>${escapeHtml(copy.heading)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    <nav>
      <a class="primary" href="/systems">${escapeHtml(copy.back)}</a>
      <a href="/">${escapeHtml(copy.home)}</a>
    </nav>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-BusinessOS-System": slug,
      "X-BusinessOS-System-Status": "not-installed",
    },
  });
}

/** The platform is Arabic-first, so the page follows the same locale cookie. */
function isArabic(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)bos_locale=([^;]+)/.exec(cookie);
  return (match?.[1] ?? "").toLowerCase().startsWith("ar");
}
