import { cookies } from "next/headers";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ALL_ROLE_KEYS, MODULES, ROLE_DEFINITIONS, ROLE_NAME, ROLE_NAME_AR, type Permission } from "@/lib/permissions";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

function actionsForRole(permissions: Permission[]): Map<string, string[]> {
  const byModule = new Map<string, string[]>();
  for (const p of permissions) {
    const idx = p.indexOf(":");
    const module = idx === -1 ? p : p.slice(0, idx);
    const action = idx === -1 ? "" : p.slice(idx + 1);
    if (!byModule.has(module)) byModule.set(module, []);
    if (action) byModule.get(module)!.push(action);
  }
  return byModule;
}

export default async function RolesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("roles:view");

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "الأدوار والصلاحيات" : "Roles & permissions"}
        description={locale === "ar" ? "مرجع صلاحيات كل دور" : "Reference of permissions per role"}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {ALL_ROLE_KEYS.map((role) => {
          const byModule = actionsForRole(ROLE_DEFINITIONS[role].permissions);
          return (
            <div key={role} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">{locale === "ar" ? ROLE_NAME_AR[role] : ROLE_NAME[role]}</h3>
                <Badge variant="secondary" className="ms-auto font-mono text-xs">{role}</Badge>
              </div>
              <div className="space-y-1.5">
                {MODULES.map((mod) => {
                  const allowed = byModule.get(mod) ?? [];
                  return (
                    <div key={mod} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{mod}</span>
                      <span className="flex flex-wrap gap-1">
                        {allowed.map((a) => (
                          <Badge key={a} variant="outline">{a}</Badge>
                        ))}
                        {allowed.length === 0 && <Badge variant="secondary">—</Badge>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}