import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { getEnv } from "@/core/config/env";
import { getDictAndDir } from "@/core/i18n/server";
import { PlatformAdminShell } from "@/components/platform-admin-shell";

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  if (session.user.role !== "admin") redirect("/");

  const { dict, locale, dir } = await getDictAndDir();
  const [pendingOrgs, pendingRequests] = await Promise.all([
    prisma.organization.count({ where: { status: "pending" } }),
    prisma.organizationAppRequest.count({ where: { status: "pending" } }),
  ]);

  return (
    <PlatformAdminShell
      pendingApprovals={pendingOrgs + pendingRequests}
      user={{ name: session.user.name ?? session.user.email, email: session.user.email }}
      appUrl={getEnv().NEXT_PUBLIC_APP_URL}
      locale={locale}
      dir={dir}
      dict={dict}
    >
      {children}
    </PlatformAdminShell>
  );
}
