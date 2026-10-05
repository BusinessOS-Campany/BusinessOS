import { betterAuth } from "better-auth";
import { organization, admin } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "@/core/config/env";
import { prisma } from "@/core/db/client";
import { logger } from "@/core/logging/logger";
import { ac, tenantRoles } from "@/core/permissions/catalog";
import { subdomainCookieDomain } from "@/core/tenancy/host";
import { onOrganizationCreated } from "@/core/org-vault/on-create";

/**
 * Shared cookie domain shared by the root host and every `{slug}.` tenant
 * subdomain (OAuth round-trips through the root stay logged in on the
 * subdomain). Null on localhost/IP/junk, where host-only cookies are correct.
 */
const crossDomain = subdomainCookieDomain(getEnv().AUTH_URL ?? getEnv().NEXT_PUBLIC_APP_URL);
if (crossDomain) {
  logger.info({ domain: crossDomain }, "[auth] cross-subdomain cookies enabled");
}

/**
 * Trusted origins: the root app URL plus wildcard tenant subdomains, with
 * explicit http(s) variants so dev/prod both authenticate cleanly.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const rawUrls = [getEnv().AUTH_URL, getEnv().NEXT_PUBLIC_APP_URL].filter(
    (v): v is string => Boolean(v),
  );
  for (const raw of rawUrls) {
    try {
      const url = new URL(raw);
      const hostname = url.hostname;
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        origins.add(`http://${hostname}`);
        origins.add(`https://${hostname}`);
        origins.add(`http://*.${hostname}`);
        origins.add(`https://*.${hostname}`);
      } else if (hostname) {
        origins.add(`http://${hostname}:${url.port}`);
        origins.add(`http://*.${hostname}:${url.port}`);
      }
    } catch {
      origins.add(raw);
    }
  }
  return [...origins];
}

export const auth = betterAuth({
  secret: getEnv().AUTH_SECRET,
  baseURL: getEnv().AUTH_URL ?? getEnv().NEXT_PUBLIC_APP_URL,
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    google: {
      clientId: getEnv().GOOGLE_CLIENT_ID!,
      clientSecret: getEnv().GOOGLE_CLIENT_SECRET!,
    },
    facebook: {
      clientId: getEnv().FACEBOOK_CLIENT_ID!,
      clientSecret: getEnv().FACEBOOK_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  advanced: {
    cookiePrefix: "bos",
    ...(crossDomain ? { crossSubDomainCookies: { enabled: true, domain: crossDomain } } : {}),
  },
  plugins: [
    admin({
      // Platform realm: user.role === "admin" gates /platform-admin + /api/platform.
      // Impersonation endpoints ship enabled; UI + audit wiring land with the console.
    }),
    organization({
      ac,
      roles: tenantRoles,
      organizationCreation: {
        // The creator becomes owner (plugin default); seed default settings here later (M3).
        afterCreateOrganization: async (data: {
          org: { id: string; slug: string };
          member: { id: string };
        }) => {
          logger.info(
            { orgId: data.org.id, slug: data.org.slug, memberId: data.member.id },
            "[tenancy] organization created",
          );
          // Gives the org its folder under `orginazition/`: profile, systems,
          // people, files, logs and its own PostgreSQL cluster. Synchronous
          // half only (mkdir + manifests); initdb is queued.
          await onOrganizationCreated({ id: data.org.id, slug: data.org.slug });
        },
      },
    }),
    // MUST stay last — forwards Set-Cookie into Next's cookie store.
    nextCookies(),
  ],
  onApiError: (error: unknown) => {
    logger.error({ err: error }, "[auth] api error");
  },
});

/** Social providers enabled by the current environment (used by the sign-in UI). */
export function getEnabledProviders(): string[] {
  const env = getEnv();
  const providers: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) providers.push("facebook");
  return providers;
}