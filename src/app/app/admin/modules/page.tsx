import Link from "next/link";
import { requireTenantPage } from "@/core/tenancy/page-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { MODULE_REGISTRY, ADMIN_MODULES } from "@/core/modules/registry";
import { ModulesToggles } from "./modules-toggles";

export default async function ModulesPage() {
  const { tenant } = await requireTenantPage({ settings: ["manage"] });
  const settings = await getOrgSettings(tenant.organizationId);

  // Admin surfaces (settings/users) are permission-gated, not module-gated:
  // an owner must always be able to re-enable a module they switched off.
  const toggleable = MODULE_REGISTRY.filter((m) => !ADMIN_MODULES.includes(m.name));

  return (
    <div className="space-y-4">
      <nav className="flex gap-2 text-sm">
        <span className="rounded-lg bg-white px-3 py-1.5 font-medium text-neutral-900 shadow-sm">
          Modules
        </span>
        <Link
          href="/app/admin/appearance"
          className="rounded-lg px-3 py-1.5 text-neutral-500 hover:bg-white hover:text-neutral-900"
        >
          Appearance
        </Link>
      </nav>
      <ModulesToggles modules={toggleable} enabled={settings.modulesEnabled ?? []} />
    </div>
  );
}
