import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { getTemplate } from "@/core/platform/templates/grocery";
import { writeAuditLog } from "@/core/audit/service";
import { orgProfilePath, postSignInPath } from "@/core/tenancy/org-route";
import { ensureUniqueOrgSlug, slugifyOrgName } from "@/core/tenancy/org-slug";
import { onOrganizationCreated } from "@/core/org-vault/on-create";

/** Maps template codes to app slugs (mirrors the email-signup route). */
const TEMPLATE_APP_MAP: Record<string, string> = {
  grocery: "grocery",
  clinic: "sama-center",
};

interface PageProps {
  searchParams: Promise<{ template?: string; next?: string }>;
}

/** Looks an org up by slug for `ensureUniqueOrgSlug`. */
function findOrgBySlug(slug: string) {
  return prisma.organization.findFirst({ where: { slug }, select: { id: true } });
}

/**
 * Landing page for a user who authenticated but has no organization yet.
 *
 * This is reached by two routes, and they used to be different pages: the
 * `/signup` social button sent `callbackURL` here directly, while the `/signin`
 * social button went to `/auth/landing` — which only *routes*. A first-time
 * Google user therefore never arrived here at all, and `/auth/landing` resolved
 * their empty membership list to `/select-org`, an empty picker with no way to
 * create anything. Provisioning is now the 0-membership branch of
 * `postSignInPath`, so every provider lands on a real org.
 *
 * The org is named from the provider's display name (`user.name`, which Better
 * Auth populates from the Google `name` claim) and its slug is forced to ASCII
 * by `slugifyOrgName` — an Arabic name would otherwise yield a `/{org}` segment
 * the router cannot match, i.e. an org created but permanently unreachable.
 * `next` is carried through so a deep link survives onboarding, and is re-checked
 * against the new org before it is used.
 */
export default async function CompleteOrgPage({ searchParams }: PageProps) {
  const { template: rawTemplate, next } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.session) redirect("/signin");

  const user = session.user;
  const template = getTemplate(rawTemplate);

  // Already a member → nothing to provision. Send them to the org they have
  // rather than to the picker: a returning Google user with one org was being
  // asked to choose from a list of one.
  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length > 0) {
    redirect(postSignInPath({ next, orgSlugs: memberships.map((m) => m.organization.slug) }));
  }

  // No org → create one, named after the account holder.
  // Seeded from the email *local* part, not the whole address: for a non-Latin
  // name it is the only ASCII we have, and "haitham" beats "haitham-gmail-com"
  // in a URL. A Google name of "محمد" therefore lands on a real, shareable
  // segment instead of a hash.
  const baseSlug = slugifyOrgName(user.name, {
    seed: user.email?.split("@")[0] ?? null,
    prefix: template?.code ?? null,
  });
  const uniqueSlug = await ensureUniqueOrgSlug(findOrgBySlug, baseSlug);

  const orgName = template ? template.nameAr || user.name || "أنشطة تجارية" : user.name || "أنشطة تجارية";

  const created = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        id: randomUUID(),
        name: orgName,
        slug: uniqueSlug,
        status: "active",
        templateCode: template?.code ?? null,
        settings: (template?.settings ?? {}) as never,
      },
    });

    await tx.member.create({
      data: { id: randomUUID(), organizationId: org.id, userId: user.id, role: "owner" },
    });

    if (template) {
      const appSlug = TEMPLATE_APP_MAP[template.code];
      if (appSlug) {
        const app = await tx.app.findUnique({ where: { slug: appSlug } });
        if (app) {
          await tx.organizationApp.create({
            data: {
              id: randomUUID(),
              organizationId: org.id,
              appId: app.id,
              status: "active",
              version: app.version,
              activatedAt: new Date(),
            },
          });
        }
      }
    }

    await writeAuditLog(tx, { organizationId: org.id, userId: user.id }, {
      action: "platform.tenant.created",
      entityType: "organization",
      entityId: org.id,
      after: {
        name: org.name,
        slug: org.slug,
        planCode: "trial",
        ownerEmail: user.email,
        templateCode: template?.code ?? null,
        installedApp: template ? TEMPLATE_APP_MAP[template.code] ?? null : null,
        source: "social-signup",
      },
    });

    return { id: org.id, slug: org.slug, name: org.name };
  });

  // The org now exists, so it gets its folder under `orginazition/`.
  await onOrganizationCreated(created);

  // A workspace the user has never seen opens on its own profile: that is the
  // page that proves the new org URL works, and that shows the name and avatar
  // they just signed in with, before anything is installed into it. `next` is
  // not honoured here — see `postSignInPath`: a deep link a user with no org
  // arrived with cannot be satisfied by the org that is being created for them.
  redirect(orgProfilePath(uniqueSlug));
}

