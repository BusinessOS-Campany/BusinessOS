import { cookies } from "next/headers";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { SearchExplorer } from "@/components/search/search-explorer";
import { searchGroups } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("search:view");
  const { q = "" } = await searchParams;
  const query = q.trim();
  const groups = await searchGroups(query, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "بحث شامل" : "Global search"}
        description={locale === "ar" ? "ابحث في الأدوية والعملاء والموردين والفواتير" : "Search medicines, customers, suppliers and invoices"}
      />
      <SearchExplorer initialQuery={query} initialGroups={groups} />
    </div>
  );
}