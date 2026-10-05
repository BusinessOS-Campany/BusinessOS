import { auth } from "@/core/auth/server";
import { sharedPrisma } from "@/core/db/client";
import { isPlatformDomain, tenantSlugFromHost } from "@/core/tenancy/host";
import { isTenantSchemaName, tenantSchemaName } from "@/core/tenancy/schemas";

/**
 * Resolved tenant context for a request. `schemaName` is where the tenant's
 * business data lives: the `t_<slug>` schema inside the one shared server.
 * Null for orgs that have not been provisioned yet.
 */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: string;
  /**
   * The org's own slug, so a route can build a `/{org}/…` URL without a second
   * lookup. Already selected by the resolution that builds this context, so
   * carrying it costs nothing; it is NOT the tenant slug parsed off the Host
   * header, which can name a different routing surface.
   */
  slug?: string | null;
  /**
   * Where the tenant's business data lives: the `t_<slug>` schema on the shared
   * server. Null for orgs that have not been provisioned yet — most code paths
   * only need organizationId.
   */
  schemaName?: string | null;
  /**
   * Always null. The `organization.databaseName` column is kept for older rows
   * but nothing routes by it any more: there are no per-tenant databases. It
   * stays on the context so callers that still read it get a null instead of
   * undefined.
   */
  databaseName?: string | null;
}

export interface TenantResolution {
  user: SessionResult["user"];
  session: SessionResult["session"];
  tenant: TenantContext;
}

/**
 * Host/session-resolved target used by `withRoute` to build the tenant client.
 * `databaseName` is always null: schema on the shared server, no exceptions.
 */
export interface TenantSpec {
  organizationId: string;
  slug: string;
  schemaName: string;
  databaseName: null;
}

const ORG_SELECT = { id: true, slug: true, schemaName: true } as const;

type SchemaOrgRow = {
  id: string;
  slug: string;
  schemaName: string | null;
};

/**
 * Builds the request's tenant spec and, as a side effect, makes sure the org's
 * schema exists.
 *
 * The open is a dynamic import so this hot path does not pull the vault's file
 * system code into every route bundle, and it is memoized per process, so after
 * the first request for an org this is a map lookup.
 */
async function specOf(org: SchemaOrgRow | null): Promise<TenantSpec | null> {
  if (!org) return null;
  // The schema name is deterministic from the slug, so it is derived here
  // rather than read from the column: an org created before provisioning ran
  // still routes to its own schema instead of silently falling back to the
  // shared one. `ensureOrgSchemaLoaded` creates it on first use.
  const schemaName = org.schemaName ?? tenantSchemaName(org.slug);
  if (!isTenantSchemaName(schemaName)) return null;
  const { isOrgVaultEnabled } = await import("@/core/org-vault/on-create");
  if (isOrgVaultEnabled()) {
    const { ensureOrgOpened } = await import("@/core/org-vault/provision");
    await ensureOrgOpened(org.slug);
  }
  return {
    organizationId: org.id,
    slug: org.slug,
    schemaName,
    // One schema in the shared server, never a dedicated database. The org's
    // portable copy is the .sql file in its vault folder.
    databaseName: null,
  };
}

function hostnameOf(request: Request): string | null {
  const host = request.headers.get("host");
  if (!host) return null;
  return host.split(":")[0].toLowerCase();
}

/* ── per-request memoization ────────────────────────────────────────────────
 *
 * Route handlers resolve the tenant three times per request with the same
 * inputs and get the same answers: `withRoute` calls `resolveTenantSpec` to
 * build the tenant-scoped Prisma client, and `requireTenantContext` inside the
 * handler re-resolves the host, the session and the organization row. Each run
 * cost its own round trips, so one authed API call sent ~10 statements to the
 * shared schema before touching tenant data. These WeakMaps (per Request, so
 * nothing can leak across requests) make the second and third resolution free.
 *
 * The memoized versions are the ones used by `resolveTenantSpec`/context, so
 * platform routes that never call them pay nothing.
 */

type SessionResult = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** One organization row can serve both resolvers: id/slug/schemaName for the
 *  spec, status for the lifecycle gate, slug/schemaName again for routing. */
const ORG_MEMO_SELECT = { id: true, slug: true, schemaName: true, status: true } as const;

type OrgMemoRow = {
  id: string;
  slug: string;
  schemaName: string | null;
  status: string | null;
};

const sessionByRequest = new WeakMap<Request, Promise<SessionResult | null>>();
const hostSpecByRequest = new WeakMap<Request, Promise<TenantSpec | null>>();
const orgByRequest = new WeakMap<Request, Map<string, Promise<OrgMemoRow | null>>>();

function getSessionMemo(request: Request): Promise<SessionResult | null> {
  let p = sessionByRequest.get(request);
  if (!p) {
    p = auth.api.getSession({ headers: request.headers }).catch((e) => {
      // Drop a rejected entry so a follow-up can retry instead of inheriting
      // a permanent failure. Matches a raw (uncached) call's behavior.
      sessionByRequest.delete(request);
      throw e;
    });
    sessionByRequest.set(request, p);
  }
  return p;
}

function getHostSpecMemo(request: Request): Promise<TenantSpec | null> {
  let p = hostSpecByRequest.get(request);
  if (!p) {
    p = resolveTenantSchemaForRequest(request).catch((e) => {
      hostSpecByRequest.delete(request);
      throw e;
    });
    hostSpecByRequest.set(request, p);
  }
  return p;
}

function getOrgMemo(request: Request, organizationId: string): Promise<OrgMemoRow | null> {
  let byId = orgByRequest.get(request);
  if (!byId) {
    byId = new Map();
    orgByRequest.set(request, byId);
  }
  let p = byId.get(organizationId);
  if (!p) {
    p = sharedPrisma.organization
      .findUnique({ where: { id: organizationId }, select: ORG_MEMO_SELECT })
      .catch((e) => {
        byId!.delete(organizationId);
        throw e;
      });
    byId.set(organizationId, p);
  }
  return p;
}

/**
 * Resolves the tenant org purely from the Host header: a platform subdomain
 * (`<slug>.businessoscompany.dpdns.org` -> slug) or a custom domain listed in
 * the org's `settings.domains`. Runs against `sharedPrisma` directly — the
 * platform registry is never tenant-scoped.
 *
 * This is the "customer opens their org" moment for subdomain and custom-domain
 * visitors, so the org's schema is opened here: created if missing, or loaded
 * from `database/<folder>.sql` when the schema is not there yet. It is a no-op
 * after the first open in this process.
 */
export async function resolveTenantSchemaForRequest(request: Request): Promise<TenantSpec | null> {
  const host = request.headers.get("host");
  const hostname = hostnameOf(request);
  if (!hostname) return null;

  if (isPlatformDomain(hostname)) {
    const slug = tenantSlugFromHost(host);
    if (!slug) return null;
    const org = await sharedPrisma.organization.findUnique({
      where: { slug },
      select: ORG_SELECT,
    });
    return specOf(org);
  }

  const org = await sharedPrisma.organization.findFirst({
    where: { settings: { path: ["domains"], array_contains: [hostname] } },
    select: ORG_SELECT,
  });
  return specOf(org);
}

/**
 * Lightweight tenant resolution used by `withRoute` to scope the request's
 * Prisma client. Host-based resolution wins (subdomain/custom domain); falls
 * back to the session's active organization. Platform admins are never
 * tenant-scoped from the session fallback.
 */
export async function resolveTenantSpec(request: Request): Promise<TenantSpec | null> {
  const byHost = await getHostSpecMemo(request);
  if (byHost) return byHost;

  const session = await getSessionMemo(request);
  if (!session?.session || session.user.role === "admin") return null;

  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) return null;

  const org = await getOrgMemo(request, activeOrgId);
  return specOf(org);
}

/**
 * Resolves the tenant context for an API request from the Better Auth session
 * and the active organization (host wins when present). Returns null when
 * unauthenticated, or when the user is not an approved member of the org —
 * callers decide between 401 and 403.
 *
 * This runs on every tenant-scoped request *and* is called from both the app
 * layout and the per-page guard, so it is deliberately cheap:
 *
 *  - one `getSession` call;
 *  - one read of the organization row, which also serves the lifecycle gate and
 *    the schema name (previously three separate reads of the same row);
 *  - one indexed membership lookup. The old code called
 *    `auth.api.getFullOrganization`, which loads *every* member and user of the
 *    org just to find the current user's role — cost grew with tenant size and
 *    on every navigation.
 */
export async function resolveTenantContext(request: Request): Promise<TenantResolution | null> {
  const result = await getSessionMemo(request);
  if (!result?.session) return null;

  const hostSpec = await getHostSpecMemo(request);
  const orgId = hostSpec?.organizationId ?? result.session.activeOrganizationId;
  if (!orgId) return null;

  // Single memoized read of the organization row: status gates lifecycle,
  // slug/schemaName route the tenant, and — because a host-based
  // `resolveTenantSpec` runs first in `withRoute` — the same row serves both
  // resolvers instead of each issuing its own query.
  const sc = await getOrgMemo(request, orgId);

  // Tenancy gate (M2): pending/rejected/suspended/cancelled tenants are cut off.
  const { assertOrganizationStatusUsable } = await import("@/core/platform/gate");
  assertOrganizationStatusUsable(sc?.status);

  // Targeted membership check: `members` has a unique index on
  // (organization_id, user_id), so this is a single index hit regardless of how
  // many members the tenant has.
  const member = await sharedPrisma.member.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: result.user.id } },
    select: { role: true },
  });
  if (!member) return null;

  const schemaName = sc?.schemaName ?? (sc ? tenantSchemaName(sc.slug) : null);

  return {
    user: result.user,
    session: result.session,
    tenant: {
      organizationId: orgId,
      userId: result.user.id,
      role: member.role,
      slug: sc?.slug ?? null,
      schemaName,
      databaseName: null,
    },
  };
}

/** Like resolveTenantContext but throws the canonical API errors. */
export async function requireTenantContext(request: Request): Promise<TenantResolution> {
  const ctx = await resolveTenantContext(request);
  if (!ctx) {
    const { ApiError } = await import("@/core/http/api");
    throw ApiError.unauthorized();
  }
  return ctx;
}