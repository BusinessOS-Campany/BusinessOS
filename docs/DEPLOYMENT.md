# Deployment Guide

## Prerequisites

- Node.js 24.x
- PostgreSQL 16/18 with `pgcrypto`
- **Wildcard DNS for tenant subdomains** (see below) — required for any
  tenant URL that uses `https://<slug>.<base>`.

## Wildcard DNS & Hosting Prerequisites

The platform serves every tenant on its own subdomain
(`https://<slug>.<base>`, e.g. `https://acme.bosc.dpdns.org`).
Before anything reachable depends on it:

1. Add a **wildcard DNS record**: `*.bosc.dpdns.org`
   (A/AAAA → the server; CNAME `*` is not valid for root-zone wildcards on
   most providers — use an actual A/AAAA record `*`).
2. Obtain a **wildcard TLS certificate** (`*.bosc.dpdns.org`,
   plus the bare base) and terminate at your reverse proxy (Traefik/Caddy/HAProxy/nginx).
3. Point the base domain `NEXT_PUBLIC_APP_URL`/`AUTH_URL` at the entrypoint.
4. **Custom tenant domains** (a customer brings `shop.example.com`) are just
   A/CNAME records at the customer side pointing at the platform; the org
   settings `domains` array binds requests (host matching), and cookies stay
   on the platform base so sessions survive both hosts.
5. To test wildcard routing in local dev without DNS, use
   `curl -H "Host: acme.bosc.dpdns.org:3100" …` (see
   `scripts/test-domain-resolution.ts`).

## Quick Start (Docker)

```bash
# 1. Clone and install
git clone <repo-url> && cd erp
npm install

# 2. Copy environment config
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, AUTH_SECRET, etc.

# 3. Start PostgreSQL
docker compose up -d   # or npm run db:up (uses a local .data/pg instance)

# 4. Run migrations + generate client
npx prisma migrate dev && npx prisma generate

# 5. Seed platform admin
npx prisma db seed     # needs SEED_PLATFORM_ADMIN_EMAIL / SEED_PLATFORM_ADMIN_PASSWORD

# 6. Start the dev server
npm run dev:erp        # main app on :3300 (see "Ports" below)
```

## Ports

| Port | Process | Command | Notes |
|------|---------|---------|-------|
| 3100 | platform, **production** | `npm run serve` | What Cloudflare/the tunnel points at |
| 3300 | platform, development | `npm run dev:erp` | Writes `.next-dev` |
| 3101 | grocery demo | `pm2 start ecosystem.config.cjs` | Serves `/demo/grocery` (`/grocery` 308-redirects there) |
| 3102–3109 | other demo systems | see `ecosystem.config.cjs` | Only when their source exists |

A demo app's public mount is **derived, not configured twice**: `rootPath` in
`src/core/demo/demo-systems.ts` comes from `mountPath(sourceDir, slug)`, so a
`demo-systems/` source yields `/demo/<slug>` and anything else keeps `/<slug>`.
Changing a mount therefore means changing the sub-app's own `basePath` in its
`next.config.ts` (it is inlined at build time, so the app must be rebuilt) — the
platform rewrite, the links on `/demo`, and the legacy redirect all follow.
`tests/core/demo-mount-paths.test.ts` fails if the two halves disagree.

Development and production cannot share a build directory. Dev overwrites the
manifest and hashed static chunks that a running `next start` serves from, which
makes the live site 404 its own JavaScript; `next.config.ts` therefore sends dev
to `.next-dev` (override with `NEXT_DIST_DIR`) while production uses `.next`.

Deploy under PM2 with `ecosystem.config.cjs` rather than ad-hoc `pm2 start`:

```bash
npm run build
pm2 delete businessos-erp grocery-demo    # restart alone reuses the OLD cwd
pm2 start ecosystem.config.cjs
pm2 save
```

`pm2 restart ecosystem.config.cjs` does **not** re-read `cwd`, so a repo that has
moved keeps running from its old path — which is exactly how a dead copy of this
repo once held port 3100 while the live site served a 45-second `/windy`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string, **`?schema=businessos`** |
| `DATABASE_SCHEMA` | No | Overrides the schema parsed from `DATABASE_URL` |
| `AUTH_SECRET` | Yes | Better Auth + grocery gateway HMAC secret (min 16 chars) |
| `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Yes | Platform base URL (drives subdomain cookie domain + trusted origins) |
| `LOG_LEVEL` | No | fatal/error/warn/info/debug/trace |
| `SEED_PLATFORM_ADMIN_EMAIL` / `SEED_PLATFORM_ADMIN_PASSWORD` | Yes | Seeded platform admin |
| `STORAGE_PATH` | No | Local storage (default `./.data/storage`) |
| `GROCERY_URL` etc. | No | Demo-system origins (defaults `http://localhost:3101…`) |
| `ERP_DATABASE_URL` | No | Base URL the grocery app uses to open tenant connections (defaults to `DATABASE_URL`) |
| `GROCERY_MIGRATIONS_DIR` | No | Migrations source for provisioning `grocery_<slug>` schemas |

## Production Build

```bash
npm run build  # --webpack (required by the Serwist PWA plugin)
npm start
```

`npm run build` goes through `scripts/build.ts`, which raises the Node heap to
8 GB. The default 4 GB limit is exceeded by this app's route graph and the
build dies with `FATAL ERROR: Ineffective mark-compacts near heap limit`.

## Database

- Shared platform database (default name `businessos`) with:
  - `businessos` schema — registry + shared-catalog tenant data.
  - `t_<slug>` schemas — legacy/back-compat tenant copies.
- Dedicated per-tenant databases `bos_<slug>` (schema `t_<slug>` + `grocery_<slug>`)
  are created idempotently at org provisioning (see `provisionTenantResources`).
- **Raw SQL gotcha:** Prisma 7 pins schemas for generated queries via the
  adapter; `$queryRaw*` follows the pool `search_path` instead. All app pools
  set `options: "-c search_path=<schema>"` — if you add a new pool, do the same
  or raw queries will land in the empty `public` schema.

## PWA

- Service worker via Serwist; webpack mode required.
- Dev mode disables the SW (`disable: NODE_ENV === "development"`).
- Icons/manifest globs configured in `next.config.ts` (`globPublicPatterns`).

## Health Checks

```
GET /api/health          → 200 { status: "ok" }
GET /api/health/database → 200 { status: "ok", latencyMs: N }
```

## Monitoring

- Structured pino JSON logs; every request carries `x-request-id`; 5xx logged
  with full context.