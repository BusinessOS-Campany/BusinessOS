import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { resolveTenantContext, type TenantResolution } from "@/core/tenancy/context";
import { getOrgSettings, type OrgSettings } from "@/core/tenancy/settings";
import { getDictAndDir, type Locale } from "@/core/i18n/server";
import type { Dictionary } from "@/core/i18n/dictionaries";

export interface DictBundle {
  dict: Dictionary;
  locale: Locale;
  dir: "rtl" | "ltr";
}

/**
 * Request-scoped reads for the server-component layer.
 *
 * A single page render used to resolve the same facts several times: the app
 * layout and every page each called `auth.api.getSession`, then
 * `resolveTenantContext` (which called `getSession` again), then
 * `getOrgSettings`, and the dictionary was resolved in the root layout, the
 * app layout and the page. That is roughly 4 session lookups and 2 settings
 * reads for one navigation.
 *
 * React's `cache()` memoizes per render pass. Note the important property in
 * React's implementation: when there is no request dispatcher (i.e. this is
 * called outside a React render, such as from a route handler) it simply calls
 * through uncached. So this module can never serve one request's tenant data to
 * another — worst case it does not cache at all.
 */

/** Raw request headers for the in-flight server render. */
export const getRequestHeaders = cache(async () => await headers());

/** `resolveTenantContext` speaks the fetch Request interface. */
export const getRenderRequest = cache(
  async () => new Request("http://internal/rsc", { headers: await getRequestHeaders() }),
);

/** The Better Auth session for the in-flight render, or null. */
export const getRenderSession = cache(
  async () => await auth.api.getSession({ headers: await getRequestHeaders() }),
);

/**
 * The fully resolved tenant for the in-flight render: session + active org +
 * lifecycle gate + membership role. Shared by the app layout and the page
 * guard so a single navigation resolves the tenant exactly once.
 */
export const getRenderTenant = cache(
  async (): Promise<TenantResolution | null> => resolveTenantContext(await getRenderRequest()),
);

/** Organization settings for the in-flight render, keyed by organization. */
export const getRenderOrgSettings = cache(
  async (organizationId: string): Promise<OrgSettings> => getOrgSettings(organizationId),
);

/** Locale/dictionary for the in-flight render. */
export const getRenderDict = cache(async (): Promise<DictBundle> => await getDictAndDir());
