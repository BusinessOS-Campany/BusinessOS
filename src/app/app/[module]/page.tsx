import { notFound } from "next/navigation";
import { requireTenantPage } from "@/core/tenancy/page-guard";
import { getRenderDict, getRenderOrgSettings } from "@/core/tenancy/request-context";
import { isModuleEnabled } from "@/core/tenancy/settings";
import { t } from "@/core/i18n/server";
import { MODULE_REGISTRY } from "@/core/modules/registry";

/**
 * Placeholder surface for operational modules landing in M4+. Doubles as the
 * server-side module gate: disabled modules 404 even on direct URL entry.
 */
export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const def = MODULE_REGISTRY.find((m) => m.href === `/app/${module}`);
  if (!def) notFound();

  const { tenant } = await requireTenantPage();
  const settings = await getRenderOrgSettings(tenant.organizationId);
  if (!isModuleEnabled(settings, def.name)) notFound();

  const { dict } = await getRenderDict();

  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <h1 className="text-lg font-semibold text-neutral-800">{t(dict, `nav.${def.name}`)}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
        {def.name === "pos"
          ? "POS terminal ships with M5 (offline-first)."
          : "This module lands with the business core (M4)."}
      </p>
    </div>
  );
}
