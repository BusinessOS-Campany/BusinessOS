# Architecture Overview

> Living document. Updated 2026-09 to the schema-per-tenant + dedicated-database
> tenancy model actually running in this repo.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router, `proxy.ts` convention, Node runtime) | 16.x |
| Language | TypeScript (strict) | ~6.0 |
| UI | Tailwind CSS 4 + shadcn/ui/Radix | 4.x |
| ORM | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) | 7.9.x |
| Database | PostgreSQL 16 (local service; 18.x target) | — |
| Auth | Better Auth (organizations/roles plugins, custom roles) | 1.x |
| i18n | Hand-rolled dictionary (`src/core/i18n/dictionaries.ts`, `ar`/`en`, RTL) | — |
| PWA | Serwist (webpack build) | 9.x |
| Tests | Vitest (fork pool, real Postgres) | 4.x |
| Logging | Pino | — |

## Deployment Model

Single Next.js monolith; platform admin, tenant apps and business logic are all
routes in one app. The **standalone demo systems** (grocery, sama, celia,
hospital, dental, lab, pharmacy, POS, optometry) each run their own dev server
and are reverse-proxied **same-origin** through `next.config.ts` `beforeFiles`
rewrites (e.g. `/grocery/*` → `GROCERY_URL/grocery/*`).

## Directory Structure

```
src/
├── app/                    # Next.js routes (api/v1, api/platform, app/*, platform-admin, profile, auth)
├── core/                   # Domain logic (zero UI deps)
│   ├── db/                 # client.ts (request-aware prisma proxy), tenant-guard.ts
│   ├── tenancy/            # context.ts (resolveTenant*), schemas.ts (provisioning, getTenantPrisma),
│   │                       # context-store.ts (AsyncLocalStorage), host.ts (domain resolution), settings.ts
│   ├── auth/               # Better Auth config, trustedOrigins, grocery-gateway.ts (HMAC tenant token)
│   ├── apps/               # System catalog adapters (grocery, sama-center) + install/request service
│   ├── systems/            # systemKind / demo-vs-real classification + marketplace helpers
│   ├── platform/           # approvals/gate (assertOrganizationActive), demo-systems
│   ├── http/               # ApiError, withRoute (tenant-context wrapping), ok()
│   └── ...                 # audit, expenses, grocery (inventory/brands/dashboard), reports,
│                           # custom-fields, workflows, seq, permissions, integrations, sama/*, i18n
├── proxy.ts                # Next 16 proxy: security headers, request-id, grocery gateway token
apps/grocery/               # Standalone Next grocery app; reads x-bos-gateway-token (src/shared/db.ts)
tests/core/                 # Vitest suite (246 tests) against the real database
```

## Tenancy Model

**One platform database, three kinds of tenant storage** (all wiring in
`src/core/tenancy/schemas.ts`):

1. **Shared `businessos` schema (78 tables)** — the platform registry (users,
   sessions, organizations, members, plans, apps, invitations, audits) plus the
   shared-catalog tenant data path and the `sama-*` center models.
2. **Dedicated `bos_<slug>` database** — per approved tenant: schema `t_<slug>`
   holds empty copies of the 54 tenant-owned tables (products, invoices, POS,
   workflows, …) and `grocery_<slug>` holds the grocery tables (migrated from
   `apps/grocery/prisma/migrations`).
3. **Legacy tenants** — `t_<slug>` schema inside the shared DB only
   (`organization.databaseName` is null); they keep working via the shared-DB
   fallback.

`organization.schemaName` / `organization.databaseName` record where each
tenant's data lives. Provisioning is idempotent:
`provisionTenantSchema`, `provisionTenantDatabase`, `provisionTenantResources`.

### Request routing (`prisma` proxy + ALS)

- `src/core/db/client.ts` exports `prisma`: a `Proxy` over the shared client.
  Models in `SHARED_MODELS` (registry + user-profile + `sama-*` catalog) always
  hit `sharedPrisma`; **every other model resolves through the
  `currentTenantContext()` from `context-store.ts` (AsyncLocalStorage)**, so
  `prisma.product` inside an org request transparently lands in that tenant's
  database/schema.
- `withRoute` (`src/core/http/api.ts`) resolves a `TenantSpec`
  (`resolveTenantSpec`, `src/core/tenancy/context.ts`) — **host first**
  (platform subdomain `<slug>.<base>` or a custom domain in
  `settings.domains`), then the session's `activeOrganizationId` (skipping
  platform admins) — and runs the handler inside `runWithTenantContext` with
  `prisma = getTenantPrisma(schemaName, databaseName)`.
- `resolveTenantContext` (full variant) also enforces the tenancy gate
  (`assertOrganizationActive` — pending/rejected/suspended/cancelled orgs are
  cut off) plus real membership lookup.

### CRITICAL: raw SQL and schemas

Prisma 7's adapter `schema` option pins only generated **model** queries. Raw
methods (`$queryRaw*`, `$executeRaw*`) run with the pool's **`search_path`** —
which defaults to `public` (empty) and fails with
`42P01 relation "X" does not exist`. Every pool in the app therefore pins both:

- `new PrismaPg(pool, { schema })` for model queries, **and**
- `new Pool({ ..., options: `-c search_path=<schema>` })` for raw queries.

Covered in `createClient` (`src/core/db/client.ts`) and
`getTenantPrisma` (`src/core/tenancy/schemas.ts`). The grocery app does the
same (`apps/grocery/src/shared/db.ts`).

### Cross-system gateway token

When a signed-in user hits `/grocery/*`, `src/proxy.ts` (Node runtime) mints a
5-minute HMAC token (`issueGroceryGatewayToken`, `src/core/auth/grocery-gateway.ts`)
carrying `{ organizationId, userId, role, schemaName: grocery_<slug>,
databaseName }` and delivers it two ways:

1. **`x-bos-gateway-token` request header** — propagated by Next to rewrite
   destinations; the grocery app's `db.ts` reads it to open a tenant-scoped
   Prisma client.
2. **`bos_grocery` HTTP-only cookie** (path `/grocery`, 5-min) for browser hops.

Resolution order: host subdomain/custom domain → session active org. Platform
admins get no token. Fails soft (pages load unsigned).

### Authentication

- Better Auth (`src/core/auth/server.ts`): plugins `admin`, `organizations`
  (custom `tenantRoles`: owner/admin/manager/cashier/accountant/viewer), and
  `nextCookies` last.
- Cross-subdomain sessions: cookie `Domain = <base>` derived via
  `subdomainCookieDomain(AUTH_URL)`; `trustedOrigins` covers the root + every
  `*.` subdomain (http and https, with the dev port).
- Custom domains resolve orgs via `settings.domains` (normalized/punycode);
  cookies still issued for the platform base so both hosts stay logged in.

## System Catalog & Approval

- `src/core/apps/*` registers system adapters (grocery, sama-center) into the
  **catalog** (`app` rows). `src/core/systems/catalog.ts` classifies each slug
  as **demo** or **real**.
- **Demo systems** can be opened instantly from the marketplace.
- **Real systems** always require platform approval: the tenant's first system
  is granted at org approval time (the approval panel selects plan + granted
  apps and installs the org's template), and every additional system goes
  `POST /api/v1/apps/[slug]/request` → `organizationAppRequest` (pending) →
  resolved at `/platform-admin/approvals`. Rejected requests can be re-requested.

## Data Integrity

- Money as `BigInt` minor units; totals always recomputed server-side.
- Atomic sale/purchase transactions: invoice + items + payments + stock + cash
  + audit roll back together.
- Stock ledger: every change has a `stockMovement`; `SUM(qtyDelta) == stockLevel.qty`.
- Audit logs append-only, written in the same transaction as the change.
- Gap-tolerant number sequences allocated inside the caller's transaction.

## Layering Rules

1. `src/core/` has zero React/Next import coupling (pure domain logic).
2. Services take the Prisma client they run on (`PrismaClient`/`Prisma.TransactionClient`).
3. Every org-scoped query filters by `organizationId`; writes go through permission checks.
4. API routes are thin wrappers: parse → service → `ok()` / `ApiError`.
5. Security headers at `proxy.ts` (all responses) and `withRoute` (API responses).

## Testing

- `npx vitest run` — 246 tests across `tests/core/*.test.ts` (fork pool, real
  Postgres). Tests do **not** set a tenant ALS context, so they exercise the
  shared-schema + `organizationId` filter path.
- `npx tsc --noEmit` — must be clean for `src/` + `tests/`. `apps/grocery` is a
  separate Next app (its own `@/` alias + Prisma); it is type-checked by its own
  config and its noise under the root tsconfig is ignored.