import { requireTenantPage } from "@/core/tenancy/page-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { AppearanceBuilder } from "./appearance-builder";

export default async function AppearancePage() {
  const { tenant } = await requireTenantPage({ settings: ["manage"] });
  const settings = await getOrgSettings(tenant.organizationId);
  return <AppearanceBuilder initial={settings} />;
}
