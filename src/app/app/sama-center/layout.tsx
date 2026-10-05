import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { resolveTenantContext } from "@/core/tenancy/context";
import {
  getOrgSettings,
  brandingCssVars,
  type OrgSettings,
} from "@/core/tenancy/settings";
import { getDictAndDir, t } from "@/core/i18n/server";
import { registerAllApps } from "@/core/apps/init";
import { appRegistry } from "@/core/apps/registry";
import { SamaSidebar } from "@/components/sama-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { SwUpdateToast } from "@/components/sw-update-toast";

export default async function SamaCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const req = new Request("http://internal/rsc", {
    headers: await headers(),
  });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) redirect("/signin");

  const ctx = await resolveTenantContext(req);
  if (!ctx) redirect("/select-org");

  const installedApp = await prisma.organizationApp.findFirst({
    where: {
      organizationId: ctx.tenant.organizationId,
      app: { slug: "sama-center" },
      status: { in: ["installed", "active"] },
    },
    include: { app: true },
  });

  if (!installedApp) {
    redirect("/my-apps?error=sama-center-not-installed");
  }

  const settings: OrgSettings = await getOrgSettings(
    ctx.tenant.organizationId,
  );
  const { dict, locale, dir } = await getDictAndDir();
  const brand = settings.branding;
  const cssVars = brandingCssVars(brand);

  registerAllApps();
  const adapter = appRegistry.get("sama-center");
  const adapterNav = adapter?.getNavigation() ?? [];

  const nav = adapterNav.map((item) => ({
    ...item,
    label: dir === "rtl" && item.nameAr ? item.nameAr : item.name,
  }));

  return (
    <div
      style={cssVars as React.CSSProperties}
      className="min-h-screen bg-background"
      dir={dir}
    >
      <SamaSidebar
        navItems={nav}
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
        branding={brand}
        locale={locale}
        dir={dir}
      />

      <div className={dir === "rtl" ? "md:mr-64" : "md:ml-64"}>
        <header
          className="sticky top-0 z-30 hidden border-b border-border bg-background md:block"
          style={{
            borderTop: `4px solid var(--brand-primary, #0d9488)`,
          }}
        >
          <div className="flex items-center justify-between px-6 py-3">
            <h1 className="text-lg font-semibold text-foreground">
              {t(dict, "nav.dashboard")}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {session.user.email}
              </span>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 pb-20 md:px-6 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />
      <SwUpdateToast />
    </div>
  );
}
