import { redirect } from "next/navigation";
import {
  getRenderDict,
  getRenderOrgSettings,
  getRenderSession,
  getRenderTenant,
} from "@/core/tenancy/request-context";
import { brandingCssVars, hasInShellModules, isModuleEnabled } from "@/core/tenancy/settings";
import { orgHomePath } from "@/core/tenancy/org-route";
import { t } from "@/core/i18n/server";
import { MODULE_REGISTRY } from "@/core/modules/registry";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { SwUpdateToast } from "@/components/sw-update-toast";

/**
 * Tenant application shell. Requires session + active organization; injects
 * tenant branding as CSS custom properties and filters nav by module toggles.
 *
 * Every read here goes through the request-scoped helpers, so the session,
 * tenant and org settings this layout needs are the same objects the page
 * below it resolves, instead of each layer issuing its own queries.
 *
 * An org with `modulesEnabled: []` is sent to its apps catalog instead. That
 * layout is the shared ERP — products, sales, inventory — and an org whose list
 * is explicitly empty does not use it; it installs its own systems, each in its
 * own process. The shell it would get is an empty sidebar and a dashboard of
 * zeroes, which is worse than no page at all: it looks like the product is
 * broken. Org that have modules enabled, and orgs that predate the list, are
 * untouched.
 */
export default async function TenantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRenderSession();
  if (!session) redirect("/signin");

  const ctx = await getRenderTenant();
  if (!ctx) redirect("/select-org");

  const settings = await getRenderOrgSettings(ctx.tenant.organizationId);
  const { dict, locale, dir } = await getRenderDict();
  const brand = settings.branding;
  const cssVars = brandingCssVars(brand);

  // Only when the org can be named. A missing slug means the resolution did not
  // carry one, and guessing a path would be worse than rendering the shell.
  if (!hasInShellModules(settings) && ctx.tenant.slug) {
    redirect(orgHomePath(ctx.tenant.slug));
  }

  const nav = MODULE_REGISTRY.filter((m) =>
    isModuleEnabled(settings, m.name),
  ).map((m) => ({
    ...m,
    label: t(dict, `nav.${m.name}`),
  }));

  return (
    <div
      style={cssVars as React.CSSProperties}
      className="min-h-screen bg-background"
      dir={dir}
    >
      <AppSidebar
        navItems={nav}
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
        branding={brand}
        locale={locale}
        dir={dir}
      />

      {/* Main content — offset by sidebar width on desktop */}
      <div
        className={dir === "rtl" ? "md:mr-64" : "md:ml-64"}
      >
        {/* Top bar on desktop */}
        <header
          className="sticky top-0 z-30 hidden border-b border-border bg-background md:block"
          style={{
            borderTop: `4px solid var(--brand-primary, #03EABC)`,
          }}
        >
          <div className="flex items-center justify-between px-6 py-3">
            <h1 className="text-lg font-semibold text-foreground">
              {t(dict, `nav.${nav[0]?.name ?? "dashboard"}`)}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {session.user.email}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 pb-20 md:px-6 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />
      <SwUpdateToast />
    </div>
  );
}
