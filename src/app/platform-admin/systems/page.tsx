import { getDictAndDir } from "@/core/i18n/server";
import { getAppCatalog } from "@/core/apps/service";
import { SystemsManager } from "./systems-manager";

export const dynamic = "force-dynamic";

/**
 * Platform admin — central dynamic system catalog.
 * (Requirement: one catalog powering what customers install; admins enable,
 * edit and track systems. The customer marketplace reads the same table.)
 */
export default async function SystemsPage() {
  const { dict, locale, dir } = await getDictAndDir();
  const apps = await getAppCatalog();

  return (
    <div dir={dir} className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{dict.platform.systems.title}</h1>
          <p className="mt-1 text-sm text-neutral-400">{dict.platform.systems.subtitle}</p>
        </div>
      </header>
      <SystemsManager dict={dict} locale={locale} apps={apps} />
    </div>
  );
}