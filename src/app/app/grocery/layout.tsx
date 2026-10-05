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
import { GrocerySidebar } from "@/components/grocery-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { SwUpdateToast } from "@/components/sw-update-toast";

/**
 * Grocery application layout. Wraps all /app/grocery/* pages.
 *
 * 1. Verifies session + active organization
 * 2. Checks that the Grocery app is installed & active for this org
 * 3. Renders a Grocery-specific sidebar with its own nav items
 * 4. Applies tenant branding
 */
export default async function GroceryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* ── Auth gate ──────────────────────────────────────────────────────── */
  const req = new Request("http://internal/rsc", {
    headers: await headers(),
  });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) redirect("/signin");

  const ctx = await resolveTenantContext(req);
  if (!ctx) redirect("/select-org");

  /* ── Check that the Grocery app is installed & active ────────────────── */
  const installedApp = await prisma.organizationApp.findFirst({
    where: {
      organizationId: ctx.tenant.organizationId,
      app: { slug: "grocery" },
      status: { in: ["installed", "active"] },
    },
    include: { app: true },
  });

  if (!installedApp) {
    redirect("/my-apps?error=grocery-not-installed");
  }

  /* ── Branding & locale ──────────────────────────────────────────────── */
  const settings: OrgSettings = await getOrgSettings(
    ctx.tenant.organizationId,
  );
  const { dict, locale, dir } = await getDictAndDir();
  const brand = settings.branding;
  const cssVars = brandingCssVars(brand);

  /* ── Grocery nav items from adapter ─────────────────────────────────── */
  registerAllApps();
  const adapter = appRegistry.get("grocery");
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
      <GrocerySidebar
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
        {/* Desktop top bar */}
        <header
          className="sticky top-0 z-30 hidden border-b border-border bg-background md:block"
          style={{
            borderTop: `4px solid var(--brand-primary, #03EABC)`,
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
