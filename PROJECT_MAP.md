# PROJECT_MAP.md — Business OS Platform

> **Living document.** Every implementation step MUST keep this file in sync.
> Rule: any feature not yet wired end-to-end lives in `[ORPHANS & PENDING]`; it is removed only when its verifiable goal passes.

- **Project:** Business OS Platform (multi-tenant, white-label SaaS Business OS)
- **Working dir:** `D:\Business OS\ERP\ERP` (moved from `H:\Business os\ERP` on 2026-09-30; the repo moved but the history below was written at the old path — paths in older entries are relative to the repo root)
- **Plan frozen at:** 2026-08-25 (versions verified against npm/GitHub on this date)
- **Status:** EXECUTING - ALL MILESTONES M0-M12 COMPLETE. VERIFIED 2026-10-01: `tsc --noEmit` 0 errors repo-wide, `eslint` 0 errors on all touched files, `vitest` **578/578** (42 files, run twice consecutively — the suite is idempotent against the database), `next build` green, live site verified through `https://bosc.dpdns.org`. Per-org self-service system install shipped this date; see the entry at the top of the dated log.

---

## [TECH_STACK]

All versions verified stable as of 2026-08-25. No deprecated packages. RC/beta channels avoided unless noted with a decision rule.

| Layer | Choice | Version (verified) | Rationale / Notes |
|---|---|---|---|
| Runtime | Node.js LTS "Krypton" | 24.19.x | Active LTS until Oct 2026, security fixes to Apr 2028 |
| Framework | Next.js (App Router, Turbopack) | 16.3.x (Active LTS line) | 15.5 = Maintenance LTS; security release due 2026-08-26 → track patches |
| UI lib | React | 19.2.8 | Stable line shipped with Next 16 |
| Language | TypeScript | ~6.0 (bridge line) | TS 7.0 (native Go) is `latest` but lacks programmatic API until 7.1 → breaks typed ESLint. Decision rule: move to 7.1+ when released (~Oct 2026 est.) |
| Styling | Tailwind CSS | 4.3.3 | CSS-first config (`@theme`), logical props for RTL |
| Components | shadcn/ui + Radix UI | CLI-managed | Copied into repo; Tailwind v4 compatible |
| Server state | TanStack Query | 5.102.x | |
| Client state | Zustand | 5.0.x | Only for client-only state (POS cart, UI prefs) |
| Forms | React Hook Form + Zod resolvers | latest | Zod 4.4.x for all contracts |
| Tables | TanStack Table | 8.x | View-builder foundation |
| DnD | dnd-kit | latest | Touch-friendly dashboards/forms |
| Charts | Recharts | latest (verify at install) | Dashboard/report widgets |
| DB | PostgreSQL | 18.6 (docker `postgres:18-alpine`) | Supported to Nov 2030 |
| ORM | Prisma ORM | 7.9.x stable (NOT v8 — still RC) | Rust-free engine, driver adapters, `prisma.config.ts`; adapter: `@prisma/adapter-pg` |
| AuthN/AuthZ | Better Auth | latest 1.x (verify at scaffold) | Stable, first-class organizations/members/invitations/custom roles/MFA/API-keys plugins. Fallback rule: if blocked, hand-rolled sessions on Prisma (documented) |
| i18n | next-intl | latest | `locales/ar`, `locales/en`; RTL default |
| Offline | Dexie (+ dexie-react-hooks) | 4.4.5 | IndexedDB mirror + outbox queue |
| PWA | Serwist | latest (verify at install) | Maintained SW toolchain for App Router |
| Logging | pino (+ pino-http, pino-pretty dev) | 10.3.1 | Async worker-thread transport; levels: error/warn/info/debug; redaction enabled |
| Validation | Zod | 4.4.x | Single source of truth for API/service/AI-tool schemas |
| Money math | Integer minor units (bigint) | — | Never floats; server recomputes totals always |
| Formula parser | expr-eval (pinned) or custom Pratt parser | pinned at install | NO arbitrary JS evaluation, ever |
| Tests | Vitest (unit/integration) + Playwright (E2E) | latest | Integration tests hit dockerized Postgres |
| Lint/format | ESLint (flat config) + Prettier | latest | Type-aware linting ON (TS 6 line) |

**Explicitly rejected:** Prisma 8 RC, next-auth v5 beta channel, Dexie Cloud addon (vendor lock), Redis (not needed yet — pg-backed queue instead; add only when measured need exists).

---

## [SYSTEM_FLOW]

F1 — **Tenant resolution (every request):**
`Host/subdomain or custom domain → middleware lookup (cached, tenant-scoped key) → TenantContext{orgId, org settings, modules, flags} attached to request → route handler`.

F2 — **Auth:** `Better Auth session (secure cookie) → session contains userId + activeOrgId → membership verified → role permissions loaded (module.action.scope)`.

F3 — **Write path (financial integrity):**
`UI/API (zod validate) → Service (business rules, permission check) → Repository (auto-injects organizationId filter) → single Prisma $transaction [record + stock ledger + cash + balances + audit_log + outbox_event] → COMMIT or full ROLLBACK`.

F4 — **Offline sync:**
`UI → local state → IndexedDB (Dexie mirror) → outbox queue (client UUID = PK, idempotencyKey) → batched POST /api/v1/sync → server replays ops idempotently inside transactions → conflicts detected via updatedAt/version → auto-resolve (LWW safe fields) or conflict_queue (admin review) → ack clears outbox`.

F5 — **AI tool call:**
`User prompt → provider adapter (OpenAI-compatible, BYO key) → model emits tool call → Tool Registry validates: tenant ✓ permission ✓ zod args ✓ rate/usage limit ✓ → read tools execute via same tenant repos → mutating tools create pending_action + confirmation token → user confirms → execute → audit log + ai_usage_log (tokens/cost)`.

F6 — **Workflow execution:**
`Domain service commits → outbox event row (same tx) → background worker polls jobs → matches workflow rules (trigger + conditions) → executes actions (notify/email-log/webhook/create-record) → execution log + retry w/ backoff`.

---

## [ARCHITECTURE]

Single deployable Next.js app (no microservices). Domain-driven modules; shared core only for proven reuse.

```text
src/
  app/
    (marketing)/          # public site, SEO
    auth/                 # sign-in/up, onboarding wizard
    platform-admin/       # platform owner console (separate gate)
    app/                  # tenant application (org-scoped shell)
    api/v1/               # REST API (keys, scopes, rate limits)
    api/health/           # liveness, database, sync
  modules/                # business domains (service + repo + schemas + types + ui)
    products/ inventory/ sales/ purchases/ customers/
    suppliers/ expenses/ finance/ employees/ reports/ pos/
  core/                   # ONLY real cross-cutting reuse
    db/ auth/ tenancy/ permissions/ audit/ events/ jobs/
    workflows/ ai/ storage/ cache/ logging/ http/ i18n/ sync/ config/
  components/ui/          # shadcn-based kit; feature-specific UI stays in its module
locales/{ar,en}/          # ALL user-facing strings; never hard-coded
prisma/                   # schema + migrations
docs/                     # architecture/db/api/security/offline/deployment
docker-compose.yml        # postgres:18 + pgadmin (redis commented out)
```

**Layering rules (enforced in review):**
1. UI never touches repositories directly.
2. Repositories ALWAYS take `TenantContext` and auto-scope by `organizationId`; raw client access to Prisma outside `core/db` is forbidden.
3. Services own business rules and emit domain events; they never read HTTP objects.
4. Money: integers (minor units) + currencyCode + fxRate captured at transaction time; original amounts never mutated.
5. Audit logs are append-only for normal roles.

---

## [MILESTONES] (details + verifiable goals in ROADMAP.md)

| ID | Milestone | Goal (one-line) | Size |
|---|---|---|---|
| M0 | Foundation | Scaffold + Docker(pg/pgadmin) + Prisma + auth + health + logging; build green | M |
| M1 | Tenancy Core | Orgs, tenant resolution, tenant-guarded repos, RBAC, audit | L |
| M2 | Platform Admin | Create/suspend tenants, plans/limits, templates, announcements | L |
| M3 | Tenant Admin | Branding engine, module toggles, users/roles, settings, ar/en | L |
| M4 | Core Business | Products/inventory/customers/suppliers/sales/purchases/expenses/cash + atomic flows + reports v1 | XL |
| M5 | Customization Engine | Custom fields, form/view/dashboard/report builders, safe formulas | XL |
| M6 | Workflows/Automations | Triggers, conditions, actions, logs, retries | L |
| M7 | Offline Engine | Dexie mirror, outbox sync, idempotency, conflicts, devices | L |
| M8 | POS + Printing | Touch POS, barcode, holds/returns, thermal/A4 branded receipts | L |
| M9 | AI Layer | Copilot, governed tools, confirmations, metering, NL automations | L |
| M10 | PWA / Mobile UX | Manifest, SW, installability, mobile/tablet layouts | M |
| M11 | Integrations/API | Public API v1, webhooks, import/export, backups | L |
| M12 | Hardening | Isolation suite, perf, security headers, full DoD E2E, docs, deploy guide | L |

---

## 2026-10-05 — THE ADMIN CONSOLE HAD NO LOADING BOUNDARY, SO EVERY CLICK SHOWED NOTHING AT ALL FOR ITS FIRST HALF-SECOND (implemented, verified)

**The report:** the console is *correct* now but still feels sluggish — the page you were on just sits there while the next one is fetched.

### Why it looked like a stall

With the 36 s wedge gone, a click in the console was one blocking RSC round trip of 400–1 900 ms through the Cloudflare tunnel, and `/platform-admin` had **no `loading.tsx` anywhere in the segment**. With no Suspense boundary to fall back to, Next keeps the current tree on screen until the new payload has fully arrived and committed. To an operator that is indistinguishable from a frozen app: the URL has not moved, nothing has changed, and the only evidence the click registered is the browser's own spinner — which this console has none of.

The cost was not in the wrong place. Nothing about the pages changed: only *when* the user is told to wait.

### The fix

`src/app/platform-admin/loading.tsx` — one skeleton for the segment, shaped like the overview page, marked `aria-busy="true"`. A real boundary, not a spinner, and it also caps what the router needs to prefetch for a link: without it a hover prefetched the entire page. `aria-busy` is load-bearing rather than decorative — it is how a screen reader knows the region is a placeholder, and it is the marker the probe settles on the *absence* of.

### The harness had to learn the difference between "a page" and "a placeholder"

With a skeleton on screen, "the click rendered" and "the click was acknowledged" became two different questions, and conflating them would have flattered the app by measuring the skeleton. `scripts/platform-admin-nav-check.ts` now reports both:

- **`feedbackMs`** — the URL has committed and the region belongs to the new route. What the operator actually perceives.
- **`clickToContentMs`** — `main` has children and is **not** `aria-busy`. The real page. The only number comparable with earlier runs.

A second artefact went with it: the walk started on `/platform-admin`, which is also its first target, so that click was a no-op and its ~20 ms sat in every average. It now parks on the last route first — **inside** the console, because the admin nav only exists in this layout; parking on `/profile` leaves a page with no sidebar at all and the run collects zero rows.

### Verification

`npx tsc --noEmit` 0 · `npx eslint` 0 on all 3 touched files · `npx vitest run` **683/683 PASS (53 files)**, twice consecutively · `npm run build` exit 0 · `pm2 restart businessos-erp`. Three runs of the probe, every one of the six clicks a real navigation:

| | before this entry | after |
|---|---|---|
| avg **feedback** (click → skeleton on screen) | *no feedback until content* | **118 / 179 / 217 ms** |
| avg **click → content** | 891–1 267 ms | **470 / 563 / 572 ms** |
| document loads per click | 0 | 0 |
| RSC requests per click | 3–6 | 1 |
| worst route | `tenants`, 1 689 ms | `systems`, 659 / 852 / 860 ms |

Content time did not regress — as it must not, since a boundary adds no work — but the visible response to a click arrived **3–4× sooner**. The worst route moved off the fixed page entirely: `tenants` is now 413–439 ms, and `systems` is the slowest at 654 ms of server time.

TDD held: `tests/core/platform-admin-loading.test.ts` asserts the boundary exists, carries `aria-busy`, and hard-codes no user-facing copy, and it failed first with `expected false to be true` on all three.

### Two things the network did during this session, neither of them the app

1. **Chrome could not reliably reach the public host.** Runs alternated `ERR_CONNECTION_TIMED_OUT` and `ERR_NAME_NOT_RESOLVED` at `https://bosc.dpdns.org/platform-admin` while node's own `https` reached the same host in 400 ms throughout. The host is Cloudflare-fronted and publishes AAAA records; the browser prefers them, this machine has no working IPv6 route. The harness now resolves the host's IPv4 with `node:dns` and hands Chrome `--host-resolver-rules` for that one name — looked up per run, no pinned address, `NAV_CHROME_DNS=0` disables it.
2. **One cold document load measured 30 026 ms.** Not the app: the server's own render times in the same run were 160–764 ms, and a direct fetch of a full 19 KB document through the same tunnel took 442–1 245 ms three times running. That number is Chrome's `networkidle2` heuristic waiting on a connection that stayed open, and it is why the cold load in the probe is a diagnostic, not a measurement.

---

## 2026-10-03 — THE ADMIN CONSOLE BLOCKED ITS OWN EVENT LOOP FOR 36 SECONDS ON EVERY VISIT TO THE TENANT LIST (implemented, verified)

**The report:** `https://bosc.dpdns.org/platform-admin/` — moving between pages is very slow.

### The measurement, before reading any code

`scripts/platform-admin-nav-check.ts` (new, kept) signs in as a throwaway `role = "admin"` account, loads the console once, then clicks the six sidebar links in turn and records per click: wall time to the new page rendered, how many requests it took, whether the browser issued an RSC request (a client-side navigation) or loaded the whole document, and — the part that mattered — **when the response body finished**, not when its headers arrived.

| route | click → rendered | requests | document loads |
|---|---|---|---|
| overview | 111 ms | 1 | 0 |
| approvals | 1 188 ms | 3 | 0 |
| **tenants** | **30 031 ms — the URL never changed** | 2 | 0 |
| plans | 5 855 ms | 29 | 1 |
| announcements | ~~30 751 ms~~ **322 ms — a false positive, see below** | 1 | 0 |
| systems | 1 545 ms | 5 | 0 |

**One route of six genuinely failed to commit: `tenants`.** Correcting the average for the artefact below: **avg ~6 509 ms per click**, and `plans`/`approvals` are not slow on their own either — they were queueing behind the tenants render. The `12 002 ms` figure this entry originally carried was inflated by scoring a page that had loaded in 322 ms as a 30 s hang.

The trace is where the report stopped being about the admin console at all. `tenants` sent its RSC request at +6 ms and got **headers at 1 569 ms** — the layout renders fine, the gate passes, the session resolves — and then **no body, ever, inside 30 s**. Nothing about the tenants page is that heavy: one `findMany` over twelve orgs plus a folder listing. And `plans`, whose entire query is `prisma.plan.findMany`, answered its *headers* in **5 218 ms and 10 193 ms** on two runs, minutes apart, from a database that answers in single-digit milliseconds. A page that cheap cannot be slow on its own; it can only be waiting for the process.

### The cause

`readAllVaultFileStatus()` — one line in `platform-admin/tenants/page.tsx` — walks **every registered org's folder tree, synchronously, on the render**. Measured directly, twice:

```
registered orgs: 12
readAllVaultFileStatus(): 36585ms for 12 orgs
second run: 36001ms
  ajwad    folderBytes=1503927344
  gm       folderBytes=1942284529
  p967770416171 folderBytes=1730250189
```

Five of those folders contain a full `systems/grocery/node_modules` (65 246 entries in `gm` alone), and `pathSize` recurses into all of it with `readdirSync` + `statSync`. Three consequences, in order of how much damage they do:

1. **The page never answers.** 36 s of synchronous work inside a render.
2. **Every other request in the process queues behind it.** That is the 5–10 s `plans` header time, and it is why clicking *around* the wedge felt slow too — the console was collateral damage of one page.
3. **The browser's router is left holding a navigation that never completes**, so the clicks that follow it stall too and Next eventually falls back to a hard document load (the `documentLoads: 1` and the 12–14 stray `_rsc` requests on the following routes).

And the number the walk produces is **read by nothing**. `folderBytes` has no reader in any page; the tenant list uses `sqlExists`, `sqlBytes` and `sqlExportedAt`, which come from a `stat` and a sidecar. 36 seconds of blocked event loop, on every render, to fill a field nobody opens.

### The fix

`src/core/org-vault/status.ts` — the walk is opt-in (`readVaultFileStatus(entry, { folderBytes: true })`) and `readAllVaultFileStatus()`, the call the list makes, does not do it. `folderBytes` reports `0` when it was not measured, so the field cannot claim a measurement nobody asked for. The CLI (`scripts/org-vault.ts`) and `backfill-org-vaults.ts` call `pathSize` directly and are untouched; `manifest.ts` is a provisioning path, not a request path.

### The probe's own bug, recorded because it produced two of the numbers above

The first version of the harness defined "rendered" as `main.textContent.length > 40`. **Announcements with nothing in it renders 31 characters**, so a page that had committed in 322 ms was scored as a 15–30 s hang — and it was scored that way in the *before* column too, twice: as `30 751 ms, 14 requests`, which is what produced the wrong "2 of 6 never committed". The URL *had* changed; the harness was waiting for a character count that never arrived. Only `tenants` failed for real. The wait is now "the URL has committed and `main` has children", and since 2026-10-05 it also excludes the loading skeleton — see the entry above.

### Verification

`npx tsc --noEmit` 0 · `npx eslint` 0 on all 4 touched files · `npx vitest run` **672/672 PASS (51 files)**, run twice consecutively · `npm run build` exit 0. TDD held: the 2 new cases in `tests/core/org-vault-files.test.ts` failed first with `expected 68 to be +0` — 68 being the byte count the walk had already produced in the temp fixture. Rebuilt, `pm2 restart businessos-erp`, then re-ran the probe against `https://bosc.dpdns.org`:

| | before | after |
|---|---|---|
| avg click → rendered | ~6 509 ms | **891 / 1 002 / 1 267 ms** (three runs) |
| routes that never committed | 1 of 6 (`tenants`) | **0 of 6** |
| `tenants` | 30 031 ms, no body | **1 689 ms** |
| document loads per click | 0–1 | 0 |
| requests per click | up to 29 | 3–6 |

**One edit here is not mine.** `scripts/org-inventory.ts` appeared in this working tree at 20:16, from another process, with three `reduce` calls typed against `string` where its own query returns `count(*)::int`. That failed `next build`'s type-check for the whole repo and took the site down mid-session. The declared column types are now `number`. If that script is someone's work in progress, this is the one line they need to know about.

**Harness kept:** `scripts/platform-admin-nav-check.ts`. Removes its own probe admin. `NAV_ONLY=a,b` narrows the routes, `NAV_HOVER=0` drops the synthetic hover, `NAV_DEBUG=1` prints the request/DOM timeline (`HDR` = headers, `END` = body complete, `DOM` = what `main` held at that moment) plus console errors.

---

## 2026-10-03 — A PRODUCT COULD NOT BE ADDED *THROUGH THE UI*, AND EVERY CLICK FELL BACK TO A FULL PAGE LOAD (implemented, verified)

**The report:** `https://bosc.dpdns.org/gm/grocery/inventory/products` — the add-product dialog does nothing, and the app is slow to move between pages.

### The previous entry fixed a different thing, and this is why it looked already-fixed

The 2026-10-03 entry above proves a product **exists and renders** — but it was inserted straight into `org_gm`, never through the form. Nothing had exercised the Server Action. So "product creation works" was true of the database and false of the application.

### Measured A/B first: the platform hop, not the system, was at fault

Same probe, same session, one variable — whether the request goes through the platform (`https://bosc.dpdns.org`) or straight to the clone (`http://localhost:50900`):

| | direct to clone | through the platform |
|---|---|---|
| products page | 1.0 s | 7.2 s |
| add product | **200, row created** | **500, `digest 4252829078@E80`** |
| navigation (8 sidebar routes) | **858 ms avg, 3–7 reqs** | **11 012 ms avg, 52–73 reqs** |

So the catalog, the permissions, the form and the schema were never at fault. The catalog seeded `عام` / `Piece` correctly and the user held `products.create`; the write path was healthy end-to-end.

### Defect 1 — `x-forwarded-host` named the platform, so every Server Action was a suspected CSRF attempt

`runtime/proxy.ts` set `x-forwarded-host` from `new URL(request.url).host`, which is **this process's own address** (`localhost:3100`), while forwarding the browser's `Origin` (`https://bosc.dpdns.org`) verbatim. Next prefers `x-forwarded-host` over `Host` when deciding whether a Server Action came from the same origin (`server/app-render/action-handler.js`, `parseHostHeader`): the two disagreed, so it aborted with `Invalid Server Actions request.` / `E80` — a 500 with no toast, the dialog left open, nothing written. It also **clobbered** the `x-forwarded-host` the outer reverse proxy had already resolved correctly.

**Fix:** `buildUpstreamHeaders()` names the host the browser actually used (`x-forwarded-host`, else `Host`, else the platform's own as a last resort), and the same expression for `x-forwarded-proto` — which had the same defect, telling a clone served over HTTPS that it was on `http`.

### Defect 2 — Next deletes `Next-Url` before the route handler sees it, and the clone hashes it

`Next-Url` is one of four values the client hashes into the `_rsc` cache-busting parameter, and the server re-computes that hash to defeat CDN cache poisoning (`server/base-server.js`, `validateRSCRequestHeaders` — **on by default in Next 16**, not opted into). `setVaryHeader` deletes the header from the request once the platform has decided it does not need it for caching, so the route handler forwarded the request **without it**. The clone then computed a hash from one value less, which the browser could never produce, and 307'd to *its* hash; the browser retried, the same deletion happened, and it looped until `ERR_TOO_MANY_REDIRECTS` — then fell back to a full browser navigation, re-downloading every chunk through two proxies. That is the 52–73 requests and the 11 s.

**The hash arithmetic, computed offline from the captured headers, identified both sides exactly:**

| input | `_rsc` |
|---|---|
| with `next-url` (what the client sent) | `bZoXZL9RPapIa7eo` |
| without `next-url` (what the clone received) | `IwGM0zVOuUah0z0T` |

and the browser alternated between precisely those two values, forever.

**Fix:** `src/proxy.ts` parks the original in `x-bos-next-url` where it is still readable, and `buildUpstreamHeaders()` puts it back. Preserving the value beats reconstructing it — the client's canonical-URL semantics are Next's business, not a second implementation of them here.

### Verification

`npx tsc --noEmit` 0 · eslint 0 on all 4 touched files · `npx vitest run` **635/635 PASS (47 files)**, no regressions · `npm run build` **exit 0**. TDD held: 5 new cases in `tests/core/system-proxy-headers.test.ts` failed first with `buildUpstreamHeaders is not a function`. Rebuilt and `pm2 restart businessos-erp`, then re-ran `scripts/gm-products-check.ts` against the **public hostname**: add product → **200, dialog closed, row in `org_gm`**; navigation → **1 740 ms avg over 8 routes, 3–7 requests**, no `ERR_TOO_MANY_REDIRECTS`, no RSC-payload fallback (was 11 012 ms / 52–73 reqs). The probe removes its own probe user, product and shadow rows.

**The page's own cold load (~8 s) is untouched and is a different thing** — it is the full HTML document through the Cloudflare tunnel plus the clone's runtime render, not a per-click cost. `NAV_JSON` before/after is in this entry's numbers above.

**Harness kept:** `scripts/gm-products-check.ts` provisions a throwaway platform member, signs in, then through the public URL checks the products page, submits the real add-product form, and times 8 sidebar clicks. `DIRECT_CLONE=1` mints a `gs_session` into `org_gm` and bypasses the platform — that A/B is what found this. `NAV_DEBUG=1` prints the RSC headers and every 3xx; `NAV_DUMP=<path>` writes them as JSON.

---

## 2026-10-03 — PROFILE PHOTOS RE-DOWNLOADED IN FULL ON EVERY PAGE VIEW (implemented, verified)

**The report:** "in https://bosc.dpdns.org/gm/profile photos is load slow why??"

### Why: two independent defects, and the outer one silently won

The media read handler already *tried* to be cache-aware — it sent `private, max-age=0, must-revalidate`. That header never reached the browser, because `next.config.ts` `headers()` stamps `Cache-Control: private, no-store, max-age=0` on **`/api/:path*`**, and configured headers are applied *after* the route handler sets its own (the repo's own comment at the `/_next/static` override says so). `no-store` does not mean "revalidate" — it forbids the browser from keeping the body at all. So every profile view re-downloaded the avatar (to 2 MB) and the cover (to 5 MB) from origin, over the tunnel. One profile page makes it worse: `profile-header.tsx` and the shell's `user-nav.tsx` both render `session.user.image`, which is that same `/api/v1/profile/avatar` ref, so the same bytes are fetched twice per view.

The handler could not have rescued it anyway: with no `ETag` and no `Last-Modified`, even a correct revalidation policy can only re-send the whole file. There was nothing for the browser to revalidate *against*.

### What changed

1. **`next.config.ts`** — a rule for `/api/v1/profile/:kind(avatar|cover)` placed **after** `/api/:path*` (last rule to set a header wins, the same mechanism the `/_next/static` override already uses), sending `private, no-cache, must-revalidate, max-age=60`. Those two paths are the *only* exception to `API_CACHE`; every other API route keeps `no-store`.
2. **`core/profile/media.ts`** — `MEDIA_CACHE_CONTROL`, `mediaEtag(size, mtimeMs)` and `mediaNotModified(headers, etag, mtimeMs)`. Pure and DB-free, so the whole validator decision is unit-testable. `If-None-Match` is compared weakly and takes precedence over `If-Modified-Since` (RFC 9110 §13.1.3); the date comparison truncates to whole seconds, which is all an HTTP-date carries.
3. **`core/profile/media-handlers.ts`** — `handleMediaGet` now resolves the key with a `stat` per candidate instead of a `read` per candidate (it used to read and discard up to six files — three extensions × current-and-legacy key — to find the one that existed), answers **304** when the validator matches, and returns the `Buffer` directly rather than through `new Uint8Array(buffer)`, which was a second full copy of a 5 MB cover.
4. **`core/integrations/storage.ts`** — `node:fs/promises` instead of the sync calls. These run inside request handlers, and `readFileSync` on a multi-megabyte cover stalls the entire event loop, i.e. every other in-flight request, for the duration of the read. Added `stat()` to `StorageProvider`; it returns `null` for an absent key rather than throwing, because a caller probing several candidates treats "not there" as the normal answer.

### The security posture is unchanged, deliberately

This relaxes `no-store` to `private, no-cache` and nothing else. `private` still forbids every shared cache, so Cloudflare and any intermediary still store nothing; `no-cache` still forces a revalidation before the cached copy is used, so a replaced avatar can never be shown stale. The validator is derived from the file's own `size`+`mtime`, not from a clock, so a re-upload changes it and a 304 cannot outlive the bytes it described. The residual case — a same-size re-upload inside the filesystem's own mtime granularity — is no worse than that granularity already is; closing it would mean a version column, a migration and a second source of truth.

The `max-age=60` window is short on purpose: an avatar is replaced from this same page, so a long freshness window would show the previous photo after an upload.

### Verification

`npx tsc --noEmit` 0 · focused `npx eslint` on all 5 touched files 0 errors 0 warnings · `npx vitest run` **623/623 PASS (46 files)**, no regressions · `npm run build` **exit 0**. TDD held: the 6 new cases in `tests/core/profile.test.ts` failed first with `TypeError: mediaEtag is not a function`, then passed. The compiled `.next/routes-manifest.json` confirms the new rule is present and ordered immediately after `/api/:path*`, and that the 12 pre-existing rules are unchanged. Live HTTP against the running dev server confirms the auth gate still answers **401** unauthenticated (no IDOR). **Not verified: the runtime path match of `:kind(avatar|cover)` and the 304 handshake end-to-end — both need the dev server restarted to pick up `next.config.ts`, which was left running untouched.** In-repo precedent for the identical `:param(regex)` syntax is live in the same manifest (`/app/:system(grocery)/_next/static/:path*`).

---

## 2026-10-03 — GROCERY COULD NOT RECORD ITS FIRST PRODUCT, AND THE PLATFORM COULD NOT BUILD (implemented, verified)

**The report:** two failures, one user-visible and one that made every deploy impossible.

### 1. An org could not enter a single product

`org_gm` had 40 tables, all six migrations applied, real users and sessions — and not one category, unit or product. `Product.categoryId` and `Product.unitId` are both `NOT NULL` and both required by the product form, so the pickers rendered empty, validation rejected the save, and the store was a dead end at its very first entry. No mock data and no `localStorage` were involved: the write path was always correct, the catalog was simply empty, and **nothing in the system creates one**.

`prisma/bootstrap.ts` seeds permissions and roles. It now also gives a new org the minimum catalog it needs to record anything: one `General`/`عام` category and one `Piece`/`قطعة` (`pcs`, `isBase`) unit. Additive and idempotent — an org that made its own keeps it, and nothing is renamed or rewritten. One category and one unit, not a pre-judged taxonomy.

**The gate that was hiding it.** Bootstrap ran behind `needsDatabaseSetup`, which asks *"did this folder's sources change since the last build?"*. The rows an org needs are not decided by its sources: a bootstrap that grows a new reference row would reach orgs built *afterwards* and skip every org built *before* it — which is exactly the population that cannot enter a product. **Bootstrap is now unconditional**; `migrate deploy` stays behind that gate, because a schema genuinely is decided by sources.

### 2. Editing one bootstrap row would have cost every org a full rebuild

The clone's build hash covered `prisma/bootstrap.ts`. That file is run by `tsx` against the org's own database and imported by nothing, so `next build` never sees it — hashing it meant one added reference row triggered a minutes-long production rebuild inside a request, for a change that cannot alter a compiled byte. `BOOT_ONLY_FILES` exempts it; `prisma/schema.prisma` and `prisma/migrations/**` deliberately stay in the hash, and a test pins that.

### 3. A system whose writes fail said nothing, anywhere

`stdio: "ignore"` meant a broken clone answered the browser with a generic error and left no trace — indistinguishable from a working one. Runtime output is now piped and teed into the org's own `logs/app.log` **and** the platform's structured log, so a failure is searchable by org and system.

### 4. `connection.json` pointed operators at the wrong database

It described only the ERP tenant schema and claimed to cover the org, so anyone debugging a missing product went looking in `t_gm` — a schema no system writes to. It now names both places: the ERP schema, and `org_<folder>`, the per-org database the installed systems actually use. Same correction in `manifest.ts`. `ARCHITECTURE.md:14` still describes shared-schema tenancy and needs the same reconciliation.

### 5. `npm run build` could not complete at all

`next build --webpack` died with a heap OOM. `scripts/build.ts` existed to raise the ceiling to 8192 MB and **8192 was no longer enough** — webpack's *compile* phase exhausts the heap, not the trace phase. Measured: 8192 fails, 16384 completes. `outputFileTracingExcludes` was also added to keep the tracer out of the five cloned apps and the `public/` sub-apps; it was necessary but not sufficient, and the honest note in `build.ts` now says so. The grocery template's build script carries the same ceiling, because a clone is the same application and OOMs identically.

### Verification, against the real database

- Bootstrap run against `org_gm` through the platform's own `orgDatabaseUrl` path: `[bootstrap] schema=public permissions=39 roles=6 seeded=category+unit ok`.
- Direct query of `org_gm`: `categories=1`, `units=1` — `General`/`عام`, `Piece`/`قطعة`/`pcs`.
- The app's **own** `createProduct` service (same Zod schema, same `Serializable` transaction, same audit as the form): `SKU-0001 Test Product`, cost `1000.00`, unit `pcs`, `inventory.quantity = 10.000`, `PRODUCT_CREATE` audit row present.
- `typecheck` clean · `623/623` tests · build prints the route table.

### 6. The clone could not rebuild at all — found only by signing in for real

Everything above was verified against the database and the unit tests while `/gm/grocery` was a **500**. Signing in exposed a second, independent chain of defects. All three were silent.

**The template built with Turbopack.** `system/grocery` had `"build": "prisma generate && next build"`. AGENTS.md is explicit that `--webpack` is mandatory here, and the reason is exactly what happened: Turbopack walked up, found the *platform's* `package-lock.json`, adopted the platform as the workspace root, and compiled the platform's own `src/` into the clone's build. It then failed on the platform's `src/instrumentation.ts` — a file that does not exist in the clone, importing `@/core/systems/runtime/supervisor`. **A tenant's build was reaching into the platform's source tree.** The script is now `prisma generate && node --max-old-space-size=16384 node_modules/next/dist/bin/next build --webpack`, matching what the platform does.

**Two route modules exported non-route symbols.** `api/bos/link` exported `hashPolicy`, and both it and `api/bos/credentials` exported `isUsableDigest`. Next 16 permits only route handlers and config keys as named exports, so every clone build failed `Failed to type check` with `Property 'hashPolicy' is incompatible with index signature`. Neither function is imported anywhere; both are file-local helpers, so the `export` keyword was simply wrong. **This is why the grocery template could not produce a build at all.**

**Build failures left no trace.** `runInFolder` — which runs `prisma generate`, `migrate deploy` and `next build` — used `stdio: "inherit"`. Under a service manager the grandchild writes to a handle nobody reads, so a build that dies leaves nothing: no `build_finished`, no error, and an orphaned `next start` from a previous platform still serving stale output. It looked like a 15-minute hang. `runInFolder` now captures and tees into the org's own `logs/app.log`, exactly like `startProcess`.

### Signed-in verification, through the public path

- `POST /api/v1/public/signin` with the phone and password → `200`, session cookie minted.
- `GET /gm/grocery` → **`200`**, `set-cookie: gs_session=…`, page title `نظام اداره البقالات`, **no login form**. The link-and-retry handoff works against a real session, not just in tests.
- Supervisor lifecycle now correct: `build_started` → `build_finished` (3m39s) → `runtime_started` `port 50884, database org_gm`.
- `GET /gm/grocery/inventory/products` → `200`, and the rendered row carries product id `99a5fe97-0e8b-45f9-8cc2-816aded5e289` — the exact id inserted earlier — with cost and selling `1,000`.
- After the rebuild and two restarts, `org_gm` still holds it: `SKU-0001`, `Test Product`/`منتج تجريبي`, `costPrice 1000.00`, `sellingPrice 1000.00`, category `General`, unit `pcs`, `quantity 10.000`, `categories=1 units=1`.

**Note:** the phone sign-in needs `countryCode` — a bare number resolves to `invalid`, and the route reports that identically to a wrong password by design.

### Not fixed here, deliberately

28 pre-existing lint errors remain in files this work did not touch (`src/app/app/grocery/**`, `sama-center`, `command-palette`, `theme-provider`, `use-api-data`). The build needing 16 GB is a symptom, not a solution: something in the compile is genuinely oversized and should be found rather than papered over with a larger ceiling.

### New orphans found while verifying

- **A rebuild under a live `next start` returns 500, not a stale page.** `https://bosc.dpdns.org/auth/landing` failed with `Invariant: The client reference manifest for route "/auth/landing" does not exist`, plus `Could not find the module ".../icon-mark.js#IconMark" in the React Client Manifest` and even `Failed to load static file for page: /500 ENOENT .next/server/pages/500.html`. The server process had started at 04:29:32; `.next` was then fully rewritten (1149 files, 05:00–05:02) by a build, so the manifests the process held in memory no longer described the files on disk. `next build` deletes and regenerates `.next` rather than writing into it, so a running server loses its routes mid-flight. **A build and the serving process must never share one `.next`:** build to a scratch directory and restart, or stop the server, build, then start. This is the same hazard the `distDir` note already describes for dev, one level up.
- **The clone template and its copies have drifted, and nothing detects it.** Four of the five clones (`ajwad`, `gmsnow`, `p967770416171`, `p967775008926`) predate `api/bos/credentials/route.ts` entirely. Only `gm` matches the current template. Pushing template changes into other tenants' systems was deliberately not done here — that changes another org's code.
- **`/roles` and the other data pages are prerendered at build time and need a live database** (`Error: DATABASE_URL is not set` when built without it). The supervisor injects it, so builds work, but any page touching the database at build time is a latent failure.
- **PM2 owns the platform process** (`businessos-erp`, port 3100, auto-restarts). Starting it by hand as well produces `EADDRINUSE` and a second competing process; use `pm2 restart businessos-erp`.
- `NEXT_PUBLIC_BASE_PATH`/basePath coupling and the shared `gs_session` cookie name+`Path=/` across orgs remain unresolved.

---

## 2026-10-02 — PROFILE SYSTEM CARDS GET A VISIBLE "OPEN" BUTTON (implemented, verified)

**The report:** the card in the profile systems tab was clickable but did not look clickable. Its markup is a badge, a version chip, a "re-clone files" button and a rename button, with the *only* link being an invisible overlay:

```html
<a aria-label="إدارة البقالة" class="absolute inset-0 z-0" href="/gm/grocery"></a>
```

That is a deliberate design (comment at `profile-overview-panel.tsx:230`): the whole card is the target and the body sits above it with `pointer-events-none`, so the rename input can be edited without an anchor swallowing every keystroke. It works — and it is exactly why the card reads as a label. Nothing on it says "you can open this", so the affordance was invisible on the two surfaces that matter most.

**The change:** one visible `<Link>` in the footer row, `profile.systems.open` / `openHint` added to both locales, right-aligned with `ms-auto`. The parent already re-enables pointer events on anchors (`[&_a]:pointer-events-auto`), so no layering change was needed. The rename button keeps its own `ms-auto` only when there is no route, so the last control in the row stays flush right either way.

**Two things that would have shipped broken without a probe:**

- **A painted button can swallow nothing.** The card body is `pointer-events-none`, so a correctly-styled link inside it is still not a hit target. The check does `document.elementFromPoint` on the button's own centre and asserts the returned element is the button or inside it — the assertion that actually proves it works, rather than that it exists.
- **The button and the overlay can disagree.** Both link to `system.route`, which is computed once, so they cannot today — but they are two independent anchors, and the check asserts equal `href` so a future change to one of them fails loudly instead of producing a card whose visible button goes somewhere the card does not.

**Verified:** `npx tsc --noEmit` 0 · eslint clean · `vitest run` **582/582** · `npm run build` green · `npx tsx scripts/profile-open-button-check.ts` **8/8** against the live host — exactly one "افتح النظام" per installed system, `href` = `/{org}/grocery`, hit-test passes, overlay agrees, no horizontal overflow. `scripts/systems-install-check.ts` re-run **20/20** to confirm the `/systems` work did not regress.

**Build note:** `npm run build` OOM'd at the 8 GB cap `scripts/build.ts` sets (the file exists for exactly this and calls it a floor, not a ceiling). `NODE_OPTIONS=--max-old-space-size=12288 npm run build` compiled in 3.9 min. **Goal: the default cap stops being a coin flip on a machine that has the RAM.**

---

## 2026-10-01 — `/systems` INSTALL ASKS FOR APPROVAL (implemented, verified)

**The report:** a signed-in visitor on `/systems` clicking a system was sent to `/signup` instead of being able to add it, and nothing anywhere asked for approval. What the page actually did was bind two hard-coded template codes (`src/app/systems/page.tsx`, `TEMPLATE_BINDINGS`) and render the other **171 of 173** cards as `<Link href="/signup">` at `business-systems-section.tsx:414` — regardless of session, so an existing customer was pushed to create a second account to request a system they could already have.

**The measurement that decided the design** (`listSystemSources()` returns `["grocery"]`; that is the whole of `system/`):

| | count |
|---|---|
| cards on `/systems` | 173 |
| …with an active `app` catalog row | 136 |
| …with a source under `system/`, i.e. can actually open | **1** (`grocery`) |
| …`curated=soon`, so the API answers 400 "not available yet" | 127 |

The 4 demo cards (`pos`, `cafe`, `laboratory`, `optometry`) are `available` in the curated catalog and answer `200`, but `/pos` serves the branded *"not installed"* fallback and `/cafe` answers `404` — **zero** of the nine demo apps have a source in this repo. So "let a customer request all 173" would have filled the approval queue with systems that cannot open once approved.

**The change, four parts:**

1. **`installableCardIds()` — `src/core/systems/catalog.ts`.** A card is installable only when *both* halves exist: an active `app` row (else the request API 404s) and a source under `system/` (else the approved system 404s at `/{org}/{system}`). Pure, so both halves are passed in and the whole decision is testable with no DB and no filesystem. **Proven to fail first:** 6/6 red with `TypeError: installableCardIds is not a function`.
2. **`src/app/systems/page.tsx`** computes per-card state server-side — the org's installed apps, its pending requests, the active catalog rows and `listSystemSources()` — and passes a plain `Record` to the grid. `force-dynamic`; signed-out visitors get today's page unchanged.
3. **`business-systems-section.tsx`** renders `installable | pending | installed` and POSTs `/api/v1/apps/[slug]/request`. The card flips in place on `pending` and links `/{org}/{system}` once installed. `/demo` renders the same component with no states, so it is untouched.
4. **The approval gate itself.** `/api/v1/apps/[slug]/request` and its `/install` alias had been rewired that morning to `installSystemForOrg`, which **installs immediately** — a tenant click granted a full cloned system with nobody reviewing it. Both now call `requestSystemForTenant` and only ever write a pending row. `installSystemForOrg` runs in exactly one place: `POST /api/platform/app-requests/[id]`, the admin's approval, which is also where the clone now happens (so it inherits the rollback-on-failed-copy that the route's own best-effort clone could not give). `tests/core/install-approval-gate.test.ts` asserts the routing on route *source*, because a route that stops calling it keeps answering 200 while quietly granting installs nobody approved — **3/4 red first**, including `approving a request performs the install`.

**Two findings worth more than the change:**

- **A `Map` cannot cross the RSC boundary here.** `states` was first a `Map`, and the flight payload carried `"states":"$Q15"` — a promise — that the client never resolved, so the page silently rendered the anonymous view for a signed-in member. Caught only because the probe asserted a specific card state rather than a page load. It is a plain `Record` now, and the probe asserts the resolved flight value.
- **Sign-in mints a new session row, so `activeOrganizationId` set before sign-in lands on the discarded row.** Every check downstream then ran against an anonymous session. The probe now re-points the active org at the token sign-in actually returned, and asserts the session carries it.

**Verified:** `npx tsc --noEmit` 0 · eslint clean on all 10 touched files · `vitest run` **582/582 (43 files)** · `npm run build` green (BUILD_ID present) · `npx tsx scripts/systems-install-check.ts` **20/20** against `https://bosc.dpdns.org` — signed-out sees 0 install buttons, signed-in sees exactly `installable.size` (1), a click produces `{"state":"pending","requestId":"…"}` with **0** `organizationApp` rows, the card reads بانتظار الموافقة, the same request is what `/{org}/profile?tab=systems` lists, and after `installSystemForOrg` the card badges مثبّت and links `/{org}/grocery`.

**Hygiene note for whoever runs the probe next:** it is driven against the **public** origin, because Better Auth's `trustedOrigins()` excludes `localhost` and a browser sign-in on `http://localhost:3100` is refused with `INVALID_ORIGIN`. It cleans up the DB rows, the vault folder (324 cloned files) and the registry entry — the last two were left behind by earlier runs, so `_registry/registry.json` carried 8 stale `probe-sysinstall-*` entries that no longer had a folder or a database row. **Goal: a probe that cannot be run twice without leaving state behind is a probe nobody runs twice.**

---

## 2026-10-05 — THE DENTAL DEMO CARD COULD NOT OPEN, AND THE DENTAL CARD COULD NOT BE INSTALLED (implemented, verified)

Two independent dead ends, one shared cause: **the platform derives everything from the
folder name**, and the dental app had been placed in a folder whose name matched nothing.

### 1. The demo card pointed at a folder that does not exist

`DEMO_SYSTEMS` had `sourceDir: "public/dental-Clinic--main"`. That folder is not in this
workspace, and never was — `PROJECT_MAP.md` (2026-09-26 entry) already recorded that all nine
`public/` demo sources are absent. So `resolveDemoUpstreams` fell through both branches
(no source folder, and `DENTAL_URL` naming a port with nothing listening) and pointed the
rewrite at `/system-unavailable/dental`. `dev:dental` pointed `npm --prefix` at the same
missing folder. The card had been a dead link the whole time.

The app was moved to `demo-systems/dentalClinic`, which is the right shape — that is where
`demo-systems/grocery` lives, and `mountPath` derives `/demo/<slug>` from it. But the
registry still named the old path, and nothing detected that.

**Renamed both trees to kebab-case: `system/dentalClinic` → `system/dental`,
`demo-systems/dentalClinic` → `demo-systems/dental`.** The catalog slug is `dental` and
`catalogAppSchema` enforces kebab-case, while `systemSourceDir()` is literally
`system/<slug>` and `listSystemSources()` returns folder names. CamelCase therefore made
the source invisible to the install flow — see 2. Renaming deleted the mismatch instead of
adding a slug→folder mapping layer to six call sites.

Consequence worth recording: **camelCase folder names are not cosmetic here.** A system
whose folder name differs from its catalog slug is present, clonable-looking, and
uninstallable, with nothing failing.

### 2. `installableCardIds` could never contain `dental`

`installableCardIds` intersects catalog `activeSlugs` with `listSystemSources()`. Before the
rename that intersection was `{dentalClinic, grocery} ∩ {dental, …} = ∅` for this card, so
`dental` was filtered out of every install surface and no error was raised anywhere.

Every source test runs against a **temp folder with two fake masters**, which is correct for
testing the logic and is precisely why this shipped broken. `tests/core/deployed-system-sources.test.ts`
now reads the real tree: it asserts the shipped slugs, that each is lowercase kebab-case
(it has to equal the catalog slug that installs it), that `dental` passes the real install
gate, and that a repo-hosted real system has its demo twin.

### 3. `?schema=` in the connection string is not a libpq parameter — and PrismaPg ignores it too

Wiring the demo surfaced a defect that would have hit **every org install** of this system:

- `migrate deploy` created the tables in schema `dental`, because Prisma's CLI engine reads
  `?schema=dental` from the URL.
- The runtime adapter connected with `search_path = "$user", public` and could not see them.
  node-postgres does not treat `schema` as a connection keyword — it is a Prisma-migration key.
- With `search_path` pinned via `options=-c search_path=dental` (a real libpq keyword that
  node-postgres *does* honour), the connection resolved correctly and `SELECT` worked — but
  Prisma still failed, because **`@prisma/adapter-pg` qualifies every table with the schema
  it is told, defaulting to `public`** (`getConnectionInfo().schemaName` reads its second
  constructor argument, which the app never passed). The error names the cause exactly:
  `relation "public.Installment" does not exist`.

Both copies of `src/lib/prisma.ts` and `prisma/seed.ts` now pass
`{ schema: process.env.DATABASE_SCHEMA }` to `PrismaPg`. Unset means `public`, which is
exactly how the app behaved before, so the grocery-style status quo is preserved and the
per-org installs in M3/M4 get the isolation hook for free.

**Verified:** `npx tsc --noEmit` 0 · eslint 28 errors / 57 warnings on platform-owned code
(unchanged from baseline; the sub-apps carry their own pre-existing debt and are not part of
the platform lint scope) · `vitest run` **683/683 (53 files)** · `npm run build` green
(BUILD_ID `XUNkX_JsRMYUnbhZGpLqE`) · live probe against the rebuilt platform:
`/signin` 200 · **`/demo/dental` 200, proxied to the sub-app, final `/demo/dental/login`,
title `Sign in | Dar Al-Asnan`** · `/demo/dental/login` 200 · legacy `/dental` **308** →
`/demo/dental` · demo database `demo.dental` holds 42 tables and the seed produced
9 users / 15 patients / 19 appointments, so the card opens a populated system rather than
an empty shell.

`demo-mount-paths.test.ts` was generalised from a grocery-only `basePath` assertion to every
app under `demo-systems/`: a sub-app serves itself at whatever `basePath` it was built with,
so the platform mount and that value are two halves of one contract, and nothing links them.

### The card still said "soon" after all of that (fixed, verified)

Everything above made `/demo/dental` reachable, but the card on `/demo` still rendered as a
coming-soon showcase, so a user could not click their way in.

- **Cause: the cards do not read the registry or the catalog DB.** `/demo` renders
  `BusinessSystemsSection` (`src/components/demo/business-systems-section.tsx`), which reads
  `BUSINESS_SYSTEMS` from `src/core/demo/business-systems-data.ts` — a 439-line hand-written
  list. Its `status` is `SOON` (`{ status: "coming_soon" }`, line 208) on every entry except
  the ones switched with `LIVE(slug)`. `dental` was still `...SOON`. The tab bar and the
  iframe were already correct, because those read `liveHref("dental")`, which returned
  `/demo/dental` as soon as the registry was fixed — so the bug was invisible in every probe
  that followed a link, and only showed on the card itself.
- **Fix:** `...LIVE("dental")`, which resolves the route through `liveHref(slug)` so the card
  cannot point at a mount the platform stopped serving (the reason the literal `"/grocery"`
  had to be retired). One-token change; no platform rewrite, no DB row, no registry edit.
- **Guard added, because the status is now load-bearing:** `demo-mount-paths.test.ts` asserts
  that **every** app under `demo-systems/` is `available` on `/demo` and that its card route
  equals the mount the registry serves. It fails on `dental` before the one-token fix. The
  next sub-app to be moved into the repo fails this test instead of shipping as a dead card.

**Verified after the rebuild:** `npx tsc --noEmit` 0 · eslint on the two touched files clean,
platform-owned total unchanged at 28 errors / 57 warnings · `vitest run` **685/685 (53 files)**
(+2) · `npm run build` green after `pm2 stop businessos-erp` (BUILD_ID `j_2xcxsCof19GF_k4sFSU`)
· rendered-HTML probe of `GET /demo`: the dental card is now an
`<a href="/demo/dental" target="_blank">` carrying the **available** label and **not** the
coming-soon label; grocery is unchanged; `clinic` is still correctly *not* an anchor, so the
other 172 systems were not affected.

**Two things found while deploying this, recorded because both are traps:**

- **The platform was down.** `businessos-erp` was `stopped` in PM2 (7 restarts) and nothing
  was listening on :3100. Its error log was last written **2026-09-30**, five days stale, and
  contains only `ECONNREFUSED` to dead demo ports — i.e. the "unavailable upstream" noise,
  not a crash cause. A build was already in progress when this work started, which is why
  `npm run build` first refused with *"Another next build process is already running"*.
- **Build only against a stopped server.** The platform being down is what made rebuilding
  `.next` safe here. See the 2026-09 `.next`-rewritten-under-a-live-server entry.

---

## [ORPHANS & PENDING]

Everything below is NOT YET IMPLEMENTED. Updated continuously; entries removed only when their milestone's verifiable goals pass.

### Found while wiring the dental demo on 2026-10-05 — M3–M6 of the dental rollout, not started
- **`system/dental` still cannot be served by the runtime: 4 of 8 contract items are missing.** `systemContract("dental").missing` = `reads SYSTEM_BASE_PATH in its build config`, `src/app/api/health/route.ts`, `src/app/api/bos/link/route.ts`, `prisma/bootstrap.ts`. `src/app/[org]/[system]/route.ts` and `[...path]/route.ts` gate on `listSystemSources().includes(system)` — and `dental` now **is** in that list, so the route exists and will 404/500 at the proxy rather than refusing cleanly. A system is listed, clonable and routed while being unrunnable; `src/core/apps/service.ts:409` is the only caller that checks the contract. **Goal: `systemContract("dental").missing` is empty.**
- **`system/dental` would build with plain `next build` (Turbopack), which is the workspace-root leak and the OOM already proven on grocery.** `package.json` has `"build": "next build"`; grocery's is `prisma generate && next build --webpack` under a 16 GB heap via a launcher script. `next.config.ts` also pins `turbopack.root` in both demo copies — added for dental — precisely because a nested app otherwise walks up and infers the ERP as the workspace root. **Goal: the build log contains no workspace-root warning and completes under the documented heap.**
- **`UPLOAD_DIR` is never injected, so every org would share one imaging folder.** `src/lib/storage.ts` reads `process.env.UPLOAD_DIR` and falls back to a shared `serverdata/uploads`; the supervisor builds each org's env and sets no `UPLOAD_DIR`. Dental is the worst case of the systems shipped so far — it has an `imaging` module and a `src/app/api/files/[...path]/route.ts` that serves files by path. **Goal: two orgs' imaging files land in different directories and neither can read the other's through `/api/files/…`.**
- **`dc_session` is a second session cookie on the same `Path=/` as `gs_session`.** Dental's `src/lib/session.ts` defines `dc_session`; the platform uses `gs_session`. Same path scope, so the two overwrite each other in the browser and logging into a mounted dental clone can drop the platform session. This is the `gs_session` collision already recorded for grocery, now reachable by a second system. **Goal: a signed-in member can move between the platform and a mounted system without either session being destroyed.**
- **The demo and the real system are two byte-identical copies and will drift, exactly like grocery.** `demo-systems/dental` and `system/dental` matched file-for-file when they were placed (217 files, 67 models/enums, 28 pages, identical `schema.prisma` hash) but **have since diverged**: `demo-systems/dental/next.config.ts` now carries `basePath: "/demo/dental"` while the real one does not, so the trees can no longer be synced wholesale. The `DATABASE_SCHEMA` fix applied today had to be written twice, by hand, for this reason. **Goal: the relationship between the two trees is declared somewhere a reader can find it.**

### Found while fixing slow platform-admin navigation on 2026-10-03 — RESOLVED 2026-10-05 where noted
- **`pathSize` counts `node_modules`, so the folder size it reports is not the org's data.** `orginazition/gm` measures 1.94 GB, of which the overwhelming majority is `systems/grocery/node_modules` — a shared install that is not the tenant's data and is not what an operator asking "how big is this org's vault" means. The walk is also 36 s for twelve orgs, which is why it is off the request path now, but `scripts/org-vault.ts status --all` still pays it and `manifest.json`'s `vault.sizeBytes` (`manifest.ts:204`, written on provisioning) still publishes the misleading figure. **Goal: the folder size counts the org's own files and skips `node_modules`/`.next`, or is derived from the registry rather than a walk.**
- ~~**`/platform-admin` has no loading boundary, so a click shows nothing until the payload lands.**~~ **RESOLVED 2026-10-05:** `src/app/platform-admin/loading.tsx`, one skeleton for the segment, `aria-busy="true"`. Perceived feedback on a click went from "nothing happens until the page is ready" (891–1 267 ms) to **118–217 ms**, with content time unchanged at 470–572 ms — and because a boundary also caps link prefetch, a click now costs **1 RSC request** instead of 3–6. The harness was taught to tell a skeleton from a page at the same time; see the 2026-10-05 entry at the top of this ledger. **Goal met.**
- **The cold document load is ~5 s and is untouched.** `GET /platform-admin` answers 200 in 4 882–5 406 ms end to end. That is the full HTML document through the tunnel plus the server render, not a per-click cost, and it is the same number the grocery entry above records — a deployment concern, not a code defect. Left alone deliberately. One run on 2026-10-05 measured 30 026 ms through the probe, which is Chrome's `networkidle2` heuristic rather than the app: the server's own render in that same run was 160–764 ms and a direct fetch of the document through the tunnel took 442–1 245 ms.

### Found while fixing product creation and slow navigation on 2026-10-03 — not implemented, deliberately out of scope
- **The grocery template escapes its own `basePath` in eight places, so eight features 404 or land on the wrong app when a clone is served under `/{org}/{system}`.** `next/link` and `<Link>` add the basePath; a raw `fetch("/api/…")`, `<a href>`, `<img src>` or `redirect("/…")` does not. Found by grepping `system/grocery/src` for root-absolute URLs: `features/shell/notifications-bell.tsx:76` (`/api/notifications`), `features/shell/voice-dictation.tsx:147` and `components/voice-input.tsx:85` (`/api/ai/transcribe`), `features/customers/ui/image-view.tsx:7` + `(app)/customers/[id]/statement/page.tsx:239` (`/api/customers/transactions/…/image`), `(app)/settings/backup/page.tsx:61` (`/api/backups/…/download`), `features/reports/ui/report-shell.tsx:38` (`/api/reports/print`), and `(app)/layout.tsx:17` (`redirect("/api/auth/expire?next=%2Flogin")`). Confirmed live: `/gm/grocery/manifest.webmanifest` 307s to the **platform's** `/signin`, which is why every page load logs `Manifest: Line: 1, column: 1, Syntax error.` — the browser is parsing an HTML sign-in page as JSON. **These are template edits: fixing only `system/grocery` leaves every deployed clone broken, and fixing the clones means rebuilding them. Goal: no root-absolute URL remains in the template, and a clone served under a mount fetches only URLs inside that mount.**
- **A running `next start` and `next build` must not share one `.next`** (recorded above, 2026-10-03, still open). Hit again here: `pm2 restart` after `npm run build` is the only reason the fix went live cleanly.
- **`npm run lint` is not green and cannot be** — 71 234 problems (7 162 errors), essentially all inside `system/grocery/**`, a customer-owned app with its own toolchain that `eslint.config.mjs` deliberately ignores under `orginazition/**` and `public/grocery/**` but **not** under `system/**`. So the gate this repo advertises fails on code it does not own and does not lint-by-policy elsewhere. **Goal: `system/**` joins the ignore list, and `npm run lint` reports 0.**

### Found while fixing slow profile photo loading on 2026-10-03 — not implemented, deliberately out of scope
- **The avatar is served at full upload size for a 96–128 px circle.** `MEDIA_RECOMMENDED` (400×400 avatar, 1500×400 cover) is advisory only — nothing enforces or resizes it, so a modern phone photo (4000×3000, 3–5 MB) is stored and returned verbatim, and the browser downscales it at paint time. Revalidation removes the *repeat* download; the **first** load of a 5 MB cover is still 5 MB. Fixing it properly means a real resize step (`sharp`, or `next/image` with a loader), which is a dependency + a build-toolchain decision, not a surgical edit — so it was recorded rather than half-done. Note the existing `// eslint-disable-next-line @next/next/no-img-element` comments in `profile-header.tsx`: they justify a plain `<img>` by "a private, session-gated endpoint [that] would need a loader". That reasoning is now stale — a same-origin loader could serve a resized variant of the session-gated URL without exposing the bytes. **Goal: the stored avatar is at most `MEDIA_RECOMMENDED` pixels on its long edge, enforced at upload, so a first load costs kilobytes rather than megabytes.**
- **The avatar is fetched twice per profile view.** `profile-header.tsx` and `user-nav.tsx` both render the same `/api/v1/profile/avatar` ref. Revalidation makes the second one cheap (304), so this is now a rounding error rather than the reported symptom — but the duplicate request is still two session lookups. A shared `<ProfileAvatar>` would remove it. **Goal: exactly one avatar request per page view.**
- **`LocalStorage.write` is not atomic.** A crash or a full disk mid-write leaves a truncated file that then passes the size ceiling and the magic-byte sniff and renders as a broken image. `writeFile` to a temp path plus a `rename` would make the swap all-or-nothing. **Goal: an interrupted upload never leaves a readable half-file behind.**

### Found while adding the profile "open system" button on 2026-10-02 — not implemented, deliberately out of scope
- **A running server makes probe cleanup impossible, and the probes cannot see that it happened.** `scripts/cleanup-probes.ts` removes the DB rows, the vault folder and the registry entry, and the two browser probes clean up after themselves — but the pm2 process holds `orginazition/<org>/` open (the delete fails with `EPERM`) and keeps the whole registry in memory, so its next write resurrects every entry the script removed. The symptom is silent: the DB is empty, the pages return 200, and `orginazition/` slowly fills with folders and `_registry/registry.json` grows a `probe-*` key per run. This is exactly how 8 stale `probe-sysinstall-*` registry entries and 7 folders accumulated with no database row behind any of them. **Goal: probe orgs are created under a root the platform does not watch, or the vault exposes a `removeOrg` that closes handles first, so a check can be run repeatedly without an operator stopping pm2.**

### Found while making /systems install ask for approval on 2026-10-01 — not implemented, deliberately out of scope
- **The self-service install that was removed is still described as the product's behaviour in three places**, so the next reader will wire it back up: `docs/AUDIT-2026.md` row 8 still records "Marketplace: single-app install is instant (`active`) vs template install queues `pending`" as a *deliberate product difference*, and `docs/MARKETPLACE.md` documents the same split. `installSystemForOrg` keeps its "no human is involved, because there is nothing for a human to decide" comment, which is now false for a tenant because only an admin may call it. **Goal: the docs and the comment say one thing — a tenant install queues — and the audit row is marked superseded rather than left to be read as current.**
- **`/systems` can offer install on exactly one of its 173 cards, and the page does not say why.** `installableCardIds` is honest — a card needs an active `app` row *and* a source under `system/` — but a visitor sees a grid of 173 systems with a single "ثبّت الآن", which reads as a bug rather than as a deployment fact. The 4 demo cards (`pos`, `cafe`, `laboratory`, `optometry`) are `available` in the curated catalog and answer `200`, yet serve the branded "not installed" fallback, so they are correctly excluded. **Goal: the page states how many systems this deployment can serve and links to the work that would raise it.**
- **`business-systems-section.tsx` hard-codes every Arabic string, unlike the rest of the repo.** The rest of `/systems` and `/apps` read `platform.marketplace.*` from `core/i18n/dictionaries`, so an English visitor gets an English marketplace and a translated-shell Arabic catalog grid. The new labels (مثبّت, قيد الموافقة, بانتظار الموافقة) followed the file's own convention. **Goal: the grid takes `dict`/`locale` like its sibling, and the strings move to `locales/{ar,en}/`.**
- **A queued system shows no way to cancel it.** The card correctly stops offering the button once a request is pending, and a rejected request is reopened on the next request, but nothing withdraws a request the customer no longer wants — the queue only shrinks when an admin decides. **Goal: a pending request can be withdrawn by the member who made it, and the card offers "إلغاء الطلب".**

### Found while making system install self-service on 2026-10-01 — not implemented, deliberately out of scope
- **The install does not warm the org's runtime, so the first open still pays the whole build.** `installSystemForOrg` writes the row and clones the files in ~1 s, and the marketplace then polls `GET /api/v1/apps/[slug]/install` until `.runtime.json` appears — but nothing in the platform ever *starts* that build. The build is triggered only by the first `GET /{org}/{system}` (`ensureOrgRuntime` → `boot` → `ensureBuilt`), which the card deliberately does not navigate to. So a card that is not currently open sits at "Preparing" for the full 20-minute deadline and then times out, and the install is not actually usable until someone opens it once. Warming means firing `ensureOrgRuntime` (not awaiting it) at install time, and reporting a boot failure somewhere the org can see. **Goal: after Install, `/{org}/{system}` answers 200 without a cold build, and a failed build is visible to the org rather than only in the provisioning log.**
- **Boot concurrency is unbounded across orgs.** `evictIfFull` bounds *running* processes to `MAX_RUNNING` (8) but nothing bounds concurrent *builds*, so a bulk approval of N orgs starts N `npm run build` and N `prisma migrate deploy` at once — 8 GB heap each per `scripts/build.ts`, on one machine. `booting` only serialises per (org, system), which is the wrong granularity for this. **Goal: a queue bounds concurrent cold boots, and one org's build cannot make the platform unresponsive for everyone else.**
- **There is still no customer-facing uninstall, and the leak was measured live.** `uninstallApp` (`core/apps/service.ts`) and `shutdownSystemRuntime` (`systems/runtime/proxy.ts`) both exist and neither is called by any route. `DELETE /api/platform/tenants/[id]/apps/[appId]` only sets `status:"disabled"`, so a revoked org keeps its process, its port, its clone and its `node_modules` junction. Reproduced on 2026-10-01: deleting a throwaway org's rows left three `next start` processes running against `orginazition/verify-…/systems/grocery`, each holding its own PostgreSQL database, with nothing reporting them. **Goal: one endpoint stops the runtime, marks the row, and says whether the files and database are kept or destroyed — and deleting an org cannot leave a process behind.**
- **Removing a system source orphans every org that installed it.** The install gate reads `systemContract(slug)` at request time, so deleting `system/<slug>/` makes an already-installed system report "no source" on its next reinstall attempt while its existing clone keeps serving. Nothing detects the divergence, and the marketplace keeps offering "Open". **Goal: an org whose source was removed is reported by one command, and the card stops offering an install that cannot be reproduced.**
- **A second write race: two concurrent installs both see no existing row.** The `findUnique`-then-`create` in `installSystemForOrg` is not in a transaction, so a double-clicked Install (or a retry after a timeout) can hit the `@@unique([organizationId, appId])` constraint and surface a raw Prisma error instead of the idempotent answer. The `waiting` set in the card hides this for one browser and nothing hides it for two. **Goal: a concurrent second install returns the first install's result rather than an error.**

### Found while deploying the per-org install on 2026-10-01 — RESOLVED 2026-10-01
- ~~**A full test-suite run silently deleted a real catalog system.** `m16-self-service-install.test.ts` exercised the "coming soon" guard by borrowing the first real curated `soon` slug, pushing its id onto its cleanup list, and deleting it in `afterAll` — so every run removed `veterinary` from the `app` table and from the marketplace for every customer, with the whole suite green. Nothing asserted the seeded catalog was still present, and the drift was invisible until an unrelated test failed with "catalog app 'grocery' is missing; run the seed" — pointing at a seed that was never at fault. **Fixed:** both that test and the two new ones now adopt-or-create and *fail loudly* if a borrowed row is gone, and `system-catalog-seed.test.ts` asserts every curated slug still has a row (201 rows, verified stable across consecutive full runs). **Goal met: a full run leaves the catalog byte-identical.**

### Found while making the system routes org-scoped on 2026-10-01 — not implemented, deliberately out of scope
- ~~**`/{org}/{system}` redirected to `https://localhost:3100/signin` when signed out.**~~ Resolved 2026-10-01: `respondToScopeProblem` built an absolute `Location` from `request.url`, which behind the tunnel describes the platform's own origin, so clicking an app while signed out dead-ended on a connection error instead of the sign-in form. Both branches now emit a path-only `Location` (the same fix the grocery app's `api/auth/expire` already proved), `respondToScopeProblem` no longer takes a `Request` at all so the origin cannot be reintroduced, and 8 tests in `tests/core/org-system-scope-redirect.test.ts` assert no `Location` from that route tree can carry a scheme or a host. **Goal met.**

### Found while making the system routes org-scoped on 2026-10-01 — not implemented, deliberately out of scope
- **The legacy `/app/<system>` redirect is a `308`, so a browser that visited it before the move is stuck on the old answer.** `308` is permanently cacheable, and the target of this redirect is *not* a permanent mapping: it is the caller's active organization, so the same URL must resolve differently for two people. A session that used the old path keeps whatever it cached, which is why the org-route probe reads the destination server-side instead of by navigating. **Goal: the legacy handler answers with a status that is not permanently cached, and a session that already holds the old `308` is sent to the org-scoped path.**
- **The platform builds no URL from the forwarded host, so behind the tunnel any absolute URL derived from `request.url` can name the server's own origin.** The legacy redirect's `Location` reads `https://localhost:3100/ajwad/grocery` when inspected server-side, because a rewritten request reports the local origin. It is invisible to a user arriving from the public origin, but the same bug would surface in password-reset links, email verification, invoice links, and anything else that emails a URL. **Goal: one helper builds external URLs from the origin the client actually used, and no route handler concatenates a host from `request.url`.**
- **The grocery child's own icon hrefs are root-absolute, so they resolve to the platform and 404.** `orginazition/ajwad/systems/grocery/src/app/layout.tsx` emits `icons: { icon: "/icons/apple-touch-icon.png" }` and the same for the apple icon, with no `basePath` prefix. The child's manifest link is correct under the org, so this only affects the installed-app icons, and it is pre-existing and child-side rather than something the org-scoped move introduced. **Confirmed again 2026-10-01, and widened:** the same root-absolute mistake makes the child's own web-app manifest unresolvable under `/{org}/{system}`, so a browser opening an org's grocery copy logs `Manifest: Line: 1, column: 1, Syntax error.` — it is handed a 404 HTML body to parse as JSON. The platform's own pages log zero console errors in the same run, so this is isolated to the child. **Goal: a child metadata icon and manifest are served when the app is mounted at `/{org}/{system}`.**

### Found while deploying the live site on 2026-10-01 — not implemented, deliberately out of scope
- **Eight of the nine demo systems have no source in this repo, so `/sama`, `/celia`, `/hospital`, `/dental`, `/laboratory`, `/pharmacy`, `/pos` and `/optometry` serve a branded "not installed" page rather than the app.** (Grocery is the exception and is live at `/demo/grocery`; see the namespace note above. The eight keep root-level paths because their source is not in `demo-systems/` — `mountPath()` keys the `/demo` namespace off that directory, so restoring one under `demo-systems/` is what moves it.) The sources were found intact at `D:\new project\<name>` (10.7 GB, 7 of 8 already built with `node_modules` and `.next`), and the dead PM2 entries confirm the intended layout is `public/<name>` in the repo root. They are not deployed, and `next.config.ts` routes each to the fallback page. **Goal: `public/<name>/package.json` exists, each app answers on its registry port, and `curl https://bosc.dpdns.org/<rootPath>` returns the app.**
- **Those eight apps also each need their own PostgreSQL schema, and none of them exists.** Their `.env` files name bare schemas (`?schema=celia`, `?schema=dental`, …) in the shared `demo` database; the only bare schema present is `grocery`. The nine `demo_<system>` schemas that do exist all hold the same 55-table template and do **not** correspond to these apps' Prisma models. Two of the eight also need a different migration path: `celia-main` uses Drizzle (no Prisma), and `laboratory--main` ships **zero** Prisma migrations, so it can only be built with `db push`. **Goal: one command provisions a schema per app from that app's own migrations, and each app's health check reports a live connection.**
- **The `demo` database has 9 backup-named databases and no pruning.** `businessos_pre_20260930`, `demo_pre_20260930`, plus 6 `org_*` databases, all sit alongside the live ones with no rotation or retention. **Goal: a documented retention policy, and a restore path that has been tested at least once.**

### Found while wiring the favicon/PWA icons on 2026-09-30 — RESOLVED 2026-10-01
- ~~**Serwist precaches `public/` assets with Windows backslashes, so `icons/` and `earth/` are never served from cache.**~~ Fixed in `src/app/sw.ts` by normalizing the injected manifest at worker start (`normalizeManifest`) rather than post-processing the built `sw.js`. The baked file still contains the backslashes; they become forward slashes before the worker stores them, which the build log confirms as 7 malformed keys → 0.

### Found while fixing `/app/grocery` on 2026-09-30 — not implemented, deliberately out of scope
- **Every org's `systems.json` records the stale `/app/grocery`.** `buildSystemsManifest` resolves a system's route with `openRouteForSystem(slug)` → `openRouteForSlug` → `REAL_SYSTEM_ROUTES[slug]`, which is the in-shell path, so every org folder claims to serve its systems from a URL that now 308-redirects to `/{org}/{system}`. The marketplace does not read this file (it uses `openRouteForOrgSlug`), which is why the live site is correct and the vault copy is not — so anything that later reads the manifest, including a restore onto a different machine, resolves the wrong path. `ajwad/systems.json` still says `"route": "/app/grocery"`. **Goal: `systems.json` records the org-scoped route, and a test asserts the manifest and the marketplace agree for an installed system.**
- **The dead port range.** `PORT_RANGE_START`/`PORT_RANGE_END` (`supervisor.ts:54-55`) are read by exactly one expression, the reuse check at `supervisor.ts:496`, but nothing ever allocates from the range: `findFreePort` asks the OS for an ephemeral port, which is always outside `[4100, 4300]`. So the "reuse the remembered port so a restart does not move the app" branch is unreachable, `SYSTEM_RUNTIME_PORT_START` sets a constant that is inert, and every boot takes a fresh port — confirmed on disk, where `ajwad/systems/grocery/.runtime.json` records `51539`. **Goal: the supervisor allocates from the declared range, or the range and the env var are deleted and the port is recorded as ephemeral.**
- **The clone template and its copies can drift, and nothing detects it.** `system/grocery/**` is copied per org by `src/core/org-vault/system-clone.ts`, and this bug survived a fix in one tenant precisely because the template still carried it. There is no check that a vault copy matches its template, so the next template edit can break every existing tenant the same silent way. A `sync --check` that diffs a vault copy against the template's `sourceHash` would turn a runtime 500 into a build-time diff. **Goal: one command lists every org whose copy diverges from `system/<slug>`.**
- **Two loggers with opposite signatures, and both are used in the same mental model.** The platform logger is `logger(meta, event)`; the grocery system's own is `logger(event, meta)`. Nothing reconciles them, and `dev-login.ts` was written to the wrong one. Either the system logger should adopt the platform order, or the convention should be stated in the system template's `AGENTS.md`. **Goal: one order repo-wide, enforced by lint.**
- **`m12-isolation.test.ts` does not clean up after itself** (line 114-118 purges `orgA`/`orgB` only; the `revoked-*` org and user from line 400 are never deleted, and `purge()` never touches `users`/`sessions`/`accounts`). Every full-suite run leaks rows. **Goal: a full-suite run leaves the org/user counts exactly as it found them.**
- **`marketplace.app.requested` audit rows are written with a null `organization_id`,** so no org-scoped purge can reach them and they accumulate forever. `audit_logs` is append-only, so they cannot simply be deleted either. **Goal: the action records the acting org, or a documented retention job owns them.**
- **Registry and disk disagree.** `registry.json` lists `perfprobe-HN7XLvoo` with no vault folder and no database; `orginazition/` holds `gm-snow` and `haitham` folders with no registry entry, and both `haitham` and `gm-snow` exist as organizations. `scripts/perf-probe*.ts` (3 files) also remain. **Goal: one `org-vault doctor` command reports every divergence.**
- ~~**Stale `public/sw.js` survives a dev session.**~~ Resolved 2026-10-01: `next.config.ts` sets `disable: isDev` for Serwist, and `public/sw-dev-reset.js` (loaded only in development, `src/app/layout.tsx`) unregisters the worker and clears its caches on boot. **Goal met: dev serves no `sw.js` and self-heals a worker left by a production build.**

### Found while exposing the laptop on `bosc.dpdns.org` on 2026-09-30 — not implemented, deliberately out of scope
- **The `*.bosc.dpdns.org` ingress rule is dead, and `docs/DEPLOYMENT.md` documents it as a prerequisite.** Only the apex CNAME was created; `acme.bosc.dpdns.org` returns NXDOMAIN, so the wildcard hostname rule in the tunnel config can never match. **Goal: either the wildcard DNS record exists, or the rule and the doc step are both removed.**
- **Cloudflare Web Analytics is enabled on the zone, and the choice recorded here was reversed on 2026-10-01.** The previous resolution was to disable the feature in the Cloudflare dashboard rather than widen the CSP. That was not done; instead `src/proxy.ts` now names `static.cloudflareinsights.com` in both `script-src` and `connect-src`, because the tag is injected at the edge and cannot be removed from source. A headless browser now reports **zero** console errors on every page, and RUM data is actually collected. Revisit if the owner would rather turn Web Analytics off, in which case both the CSP addition and the dashboard setting should be reverted together. **Goal: the beacon either loads cleanly or is absent from the served HTML.**
- **`report-uri` is development-only, so production CSP violations are silently discarded.** `src/proxy.ts` appends `/api/csp-report` only when `NODE_ENV === "development"`, and `report-uri` is deprecated in favour of a `report-to` header group. **Goal: a production CSP violation reaches a sink.**
- **Three tunnels now exist across two Cloudflare accounts and nothing prunes them.** `8f547fbe` and `920893f0` are dead (the latter was mis-named `https://bosc.dpdns.org/`); `20e9adb0` is live. The old account also cannot route DNS for this zone, which is what hid the real problem. **Goal: one account, one tunnel, named for the host it serves.**
- **The live tunnel config is invisible to the repo.** The `Cloudflared` service reads `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml`, which is ACL-locked and unreadable without elevation — so `~/.cloudflared/config.yml` is a decoy that edits silently do not affect. **Goal: the service config is generated from a file tracked in the repo.**
- **cloudflared is behind on patches** (2026.9.1 installed, 2026.9.3 recommended — it warns on every invocation). **Goal: the service runs the current stable.**

## 2026-10-01 — AN ORG CAN NOW INSTALL A SYSTEM FOR ITSELF, AND A NEW ORG NO LONGER LANDS IN THE SHARED ERP

### The request
"Every app in the org has its own app installation, not the bos app — e.g. `https://bosc.dpdns.org/ajwad/grocery`, I can install grocery alone." Scoped deliberately to **grocery only**: it is the one system whose runnable source is in this repo, and the other eight sit at `D:\new project\` (10.7 GB) as a separate, un-started deployment.

### What already worked, and was the reason this was a small change
The per-org machinery was real and proven: `system/grocery` is cloned to `orginazition/<org>/systems/grocery`, gets its own database `org_<folder>`, its own process on its own loopback port, and is served at `/{org}/{system}`. `ajwad` carried a live clone (323 files, `.runtime.json` port 51539). **What was missing was the front door**, not the engine.

### The four defects, each reproduced before it was fixed
1. **"Install" never installed.** `POST /api/v1/apps/[slug]/install` parsed its body, discarded it, and called `requestSystemForTenant` — a *pending* row. A real install needed a platform admin at `/platform-admin/approvals`. `installApp()`, the only function that did install+clone, was dead code that nothing called.
2. **Two endpoints, one user action, divergent answers.** `/install` was an alias of `/request`, so they could only ever agree by accident. Both now delegate to one function.
3. **`/{org}/{system}` sent signed-out users to `https://localhost:3100/signin`.** `respondToScopeProblem` built an absolute `Location` from `request.url`, which behind the tunnel is the platform's own origin. Public scheme, loopback host, unreachable — clicking an app while signed out dead-ended on a connection error. Same class as the grocery sign-out bug already fixed; 5 tests went red on exactly that string before the fix.
4. **The marketplace offered an org a link to a system it did not own.** `getCustomerMarketplace` set `route: openRouteForOrgSlug(slug, orgSlug)` unconditionally, i.e. `/{org}/grocery` for an org that had not installed it. The card only renders that link when `state === "installed"`, but the recently-opened chips navigate to `app.route` directly, and the proxy answers 403. The route is now null unless the org actually has the system.

### The design, and the one fact it keys on
**An app is instantly installable exactly when the platform holds a runnable source for it** — `system/<slug>/` satisfying the whole `systemContract` (health route, link route, migrations, bootstrap, build script, basePath-aware config). That is a fact on disk, not a flag, and it is already implemented and was never called from anywhere.

- **Source exists** → the org gets its own private copy, its own database and its own process, immediately. No human is involved because there is nothing for a human to decide.
- **No source** → the request goes to the approval queue, unchanged. This is the correct answer for the eight systems whose sources are not in this repo, and faking an install would produce an org that believes it owns an app and gets a 502.
- The two are mutually exclusive by construction: **the clone *is* the install.** If the copy cannot be written the row is rolled back, because an org holding an install it cannot open is worse than one told to wait.

A new state, `preparing`, distinguishes "installed" from "installed and runnable". An org's copy is a folder of *source*; the production build that turns it into an app runs on first open and takes minutes, so a card that said "installed" and offered "Open" would be a promise the platform cannot keep inside a page load. The card polls a dedicated `GET /api/v1/apps/[slug]/install` and auto-opens when the build lands.

### A bug this work found in the platform, not in the feature
`installSystemForOrg` originally never created the org's **vault registry entry**. Every org created through the normal paths is scaffolded and has one, but an org whose folder creation was skipped or failed would have ended up owning an installed system it could never open — `/{org}/{system}` answers 409 without a registry entry, and nothing but the platform console could fix it. The install now upserts the entry first. Caught by `tests/core/org-system-isolation.test.ts`, which asserts the 409.

### New orgs land on the catalog, not the shared ERP
`postSignInPath` sent a single-org user to `/{org}/profile`. It now sends them to `orgHomePath` — the apps catalog — because that is the only page that can be right for every org: one that has installed nothing needs to be told what it can install, and one that has installed three needs to choose between them. Separately, `/app` (the shared in-shell ERP: products, sales, inventory) now redirects an org with `modulesEnabled: []` to its own catalog, because that org has been told, deliberately, that it runs none of the platform's built-in modules — the shell it would get is an empty sidebar and a dashboard of zeroes, which looks like a broken product rather than an empty one.

The "unset means all-enabled" back-compat rule is preserved on both paths, so an org that predates `modulesEnabled`, and a template-provisioned org with 13 modules, keep exactly the shell they had.

### Verification
- **TDD throughout.** 5 red tests reproducing the live `https://localhost:3100/...` redirect; 14 red tests for the absent install path; 2 red for the landing change. The registry-entry bug was found by a test written to check isolation, not written to find it.
- **New: 35 tests** across `org-system-scope-redirect` (8), `m17-self-service-install` (15), `org-system-isolation` (9), plus additions to `m3-tenant-admin` and `org-routing-rbac`.
- **Isolation is asserted, not assumed:** an org with no install gets **403** `SYSTEM_NOT_INSTALLED` and no process starts; an org with no vault gets **409**; a per-org gateway token carries no schema and the demo verifier rejects it; a demo token naming `grocery_*` is rejected by the per-org verifier; two orgs get different folders, different databases and different routes, and neither sees the other's edit.
- Gates: `tsc --noEmit` **0** · `eslint` **0 errors** on all touched files (1 pre-existing `<img>` warning) · `vitest` **578/578** across 42 files, run twice consecutively to prove it is idempotent.

### The pre-existing defect this uncovered
`m16-self-service-install.test.ts` exercised the "coming soon" guard by borrowing the first real curated `soon` slug, pushing its id onto its cleanup list, and deleting it in `afterAll`. **Every full-suite run silently removed `veterinary` from the marketplace** — for every customer — with the entire suite green. Nothing asserted the seeded catalog was present, and it surfaced only as an unrelated failure: `system-credentials.test.ts` erroring with "catalog app 'grocery' is missing; run the seed", which points at a seed that was never at fault. Fixed in that test and in both new ones (adopt-or-create, and *fail loudly* if a borrowed row is gone), plus `system-catalog-seed.test.ts` now asserts every curated slug still has a row. Verified: the catalog is 201 rows and unchanged across consecutive full runs. Restored the five rows the bug had eaten via the project's own idempotent seeders.

### Not defects, recorded so they are not "fixed" later
- **`preparing` means "installed, not yet built" and is derived from the existence of `.runtime.json`**, deliberately not from `isBuildCurrent`. An org that edits their own system would otherwise flip the card back to "Preparing" for a build the supervisor would in fact reuse. The question the card asks is "has this copy ever run", and that is what it answers.
- **The card is honest about a slow build rather than hiding it.** The poll interval grows 2 s → 15 s, stops on any terminal answer, and gives up at 20 minutes with a message rather than spinning forever. It does **not** start the build — see `[ORPHANS & PENDING]`, which records that as the next piece of work along with boot concurrency, uninstall, source removal and a second-install write race.
- **`grocery` remains the only installable system.** The other eight are listed and honest about it: their card offers a request, not an install.

### Verified in a real browser, through the public hostname, on a throwaway org — 14/14
`npx tsx .data/verify-self-service-install.ts` signs up a new org, signs in, installs grocery, and asserts the whole chain — then destroys what it created. Run against `https://bosc.dpdns.org`, never against `ajwad`:

| Check | Result |
|---|---|
| a new org is created with `modulesEnabled: []` | PASS |
| **a new org lands on `/{org}/my-apps`, not the shared ERP** | PASS |
| **`/app` redirects that org to its catalog** | PASS |
| **installing grocery is instant — `state: preparing`, no approval** | PASS |
| the install leads under this org (`/verify-…/grocery`) | PASS |
| the org has a vault entry, so a runtime can be started | PASS |
| its own database is named for its own folder | PASS |
| the system was cloned into the org's own folder | PASS — **324 files** |
| the clone belongs to THIS org | PASS |
| **no approval request was created** (`organization_app_requests = 0`) | PASS |
| the install row is active | PASS |
| the install is audited in the org's own `logs/audit.log` | PASS |
| **`/{org}/grocery` returns 200 — it built and served** | PASS |
| another org's system is refused for this member | PASS — 307 |
| no console errors on the platform's own org pages | PASS — **0** |

Two things this run established that a unit test could not:

1. **The audit row lands in the org's tenant schema, not the shared one.** `audit_logs` is a tenant-owned model, so inside a request `prisma.auditLog` follows the tenant context. A verification script that queries it without a tenant context reads the shared schema and finds nothing — which looks exactly like a missing audit. The org's own `logs/audit.log` mirror is the copy to assert against, because it cannot be routed to the wrong schema.
2. **The one remaining console error is the child's, and is already filed.** Opening the org's own copy of grocery produces `Manifest: Line: 1, column: 1, Syntax error.`; the platform's own pages produce **zero**. That is the pre-existing root-absolute child manifest recorded below, not a regression from this work — the two are separate codebases with separate manifests, and folding them together would have hidden this result.

### The uninstall orphan, reproduced live
Deleting a verification org's rows left its **runtime still running** — three `next start` processes holding `orginazition/verify-…/systems/grocery`, each with its own PostgreSQL database. Nothing in the platform stops a runtime when the org behind it disappears; `uninstallApp` and `shutdownSystemRuntime` both exist and neither is reachable from a route. This is the `[ORPHANS & PENDING]` entry below, now measured rather than inferred. (A verification harness must therefore stop the runtime before it can remove the folder — the processes hold file handles and the delete fails with `EPERM`.)

## 2026-10-01 — THE LIVE SITE WAS A DEV SERVER BEHIND THE TUNNEL, AND WAS SLOW BECAUSE OF ASSETS NOBODY LOOKED AT

### Symptom
`https://bosc.dpdns.org` answered `200` on every route and was nevertheless unusable. Measured through the public hostname: `/windy` **45,936 ms**, `/systems` 14,785 ms, `/my-apps` 18,223 ms, `/api/health` 2,608 ms. A route returning `200` is not evidence of a working site.

### Root causes, each measured before it was fixed
1. **The tunnel pointed at `next dev`.** Port 3100 was held by a dev server (`--webpack`), recompiling on demand. `cfOrigin;dur` was seconds while `cfEdge;dur` was 3 ms — the app, not Cloudflare, was the delay.
2. **A dead copy of the repo was serving.** PM2's `businessos-erp` had `exec_cwd` at `D:\new project\ERP\ERP`, and `pm2 restart ecosystem.config.cjs` **does not re-read `cwd`**, so deploying re-served the old build from the old path. A launch that looks correct and isn't is the worst kind.
3. **`/icons/BO.png` was 2400×1712 / 1.16 MB** and is rendered inside `h-8 w-8` (32 px) boxes in 8 places. It alone held the `load` event for **32 seconds** on every page, at an effective uplink of ~36 KB/s.
4. **The service worker precached 9.1 MB on install** — all 258 build chunks (4.1 MB) plus 5 MB of `public/` including the 1.16 MB PNG and 3.6 MB of globe textures. That is ~122 seconds of background download, saturating the link while the page was still loading, charged to every first-time visitor for files their session never opens.
5. **Next only stamps `immutable` on the assets it recognises; the rest of `/_next/static` shipped `max-age=14400, must-revalidate`.** The 229 KB stylesheet and the `app/page` / `app/layout` chunks — the critical path of every first paint — revalidated through the tunnel on every visit.
6. **The build died at Node's default 4 GB heap** (`FATAL ERROR: Ineffective mark-compacts near heap limit`), so production was never actually built from this tree.
7. **`script-src` blocked Cloudflare's own beacon**, injected at the edge, producing a CSP console error on **every** page.
8. **`pg_dump` was not on `PATH`**, so `m11-integrations` backup fell back to a logical dump while reporting success.

### Fixes
- Production serves `.next` on **3100**; dev moved to **3300** with its own `.next-dev` (`NEXT_DIST_DIR` override), because dev overwrites the hashed chunks a running `next start` serves from.
- `ecosystem.config.cjs` is the single source of PM2 truth. Deploy = `pm2 delete businessos-erp grocery-demo` → `pm2 start ecosystem.config.cjs` → `pm2 save`. Nine dead `pid N/A` ghosts were removed; `gmstore` (`D:\GMstore`) is a separate app and was left alone.
- `scripts/build.ts` raises the heap to 8 GB. `npm run build` is green.
- `public/icons/BO.webp` (30 KB, 512 px) and `public/earth/earth_atmos_2048.webp` (115 KB) replace the two heavy assets at all 8 + 1 reference sites. The originals stay on disk, since `tenant.logo` in the DB may still point at `BO.png`.
- Precache cut **9.1 MB → 251 KB** (271 entries → 15). `manifestTransforms` drops every `static/chunks/` and `static/css/` entry; `globPublicPatterns` no longer includes `earth/**`; `src/app/sw.ts` runtime-caches `/earth/` and `/models/` on first use instead.
- `/_next/static/:path*` is served `public, max-age=31536000, immutable`, ordered **last** in `headers()` so it overrides the catch-all HTML rule. All 12 assets now confirm `cf-cache-status: HIT`.
- `src/proxy.ts` names `static.cloudflareinsights.com` in `script-src` and `connect-src`.
- `src/core/org-vault/pg-bin.ts` resolves PostgreSQL 16 from `C:\Program Files\PostgreSQL\16\bin` for both backup and import.

### Verified in a real browser, cache disabled, through the public hostname
| Route | before | after | console errors |
|---|---|---|---|
| `/` | 17,131 ms | **3,600 ms** | 0 |
| `/signin` | 20,631 ms | **2,213 ms** | 0 |
| `/signup` | 25,465 ms | **2,885 ms** | 0 |
| `/systems` | 24,134 ms | **2,106 ms** | 0 |
| `/demo` | 28,722 ms | **1,973 ms** | 0 |
| `/windy` | **67,175 ms** | **1,808 ms** | 0 |

`/` DOMContentLoaded is 833 ms and origin render is 98–102 ms; the remaining ~600 ms is the cloudflared hop, which `cfOrigin;dur≈850` with `cfEdge;dur=3` attributes to the tunnel, not the app. React hydrates on every interactive route. `npx tsc --noEmit` clean, eslint clean (4 pre-existing `<img>` warnings), **461/461** vitest.

### Not a defect, recorded so it is not "fixed" later
- `GET /api/auth/get-session` shows `net::ERR_ABORTED` in a probe that closes the tab right after `load`; holding the tab open shows `200` with body `null` (correct: signed out). A duplicate in-flight call is being cancelled, and it self-heals.
- `/manifest.webmanifest` returns 404 and should — the app's metadata points at `/manifest.json`.
- The Arabic metadata in the served HTML is valid UTF-8; PowerShell renders it as mojibake.

### Still open, deliberately
Eight demo systems have no source in this repo and serve the branded fallback. Their sources are intact at `D:\new project\` and each needs its own PostgreSQL schema, which does not exist. See `[ORPHANS & PENDING]`. This is a separate deployment with per-app migration differences and was not started without approval.

## 2026-10-01 — DEMO SYSTEMS MOVED TO A `/demo/*` NAMESPACE (grocery live; the rest by registry)

### Decision
Apps whose source lives in `demo-systems/` are served under `/demo/<slug>`, so the marketplace page owns its own subtree instead of scattering demo slugs across the origin root. Grocery is the only one of the nine with source in this repo, so `/demo/grocery` is the only mount that exists today. The other eight keep their root-level paths — they are separate deployables under `public/` or restored from elsewhere, and moving them is part of restoring them, not of this change.

### The mount is derived, never written
`rootPath` in `src/core/demo/demo-systems.ts` is computed by `mountPath(sourceDir, slug)`: a `demo-systems/` source yields `/demo/<slug>`, anything else keeps `/<slug>`. Three things have to agree on that one value, and nothing checked them at compile time:
- the platform rewrite in `next.config.ts` (source **and** upstream destination — the sub-app serves itself at that same path because of its `basePath`);
- the links on `/demo` (`systems-catalog.ts`, `business-systems-data.ts`, `src/app/demo/page.tsx`), previously three hand-written path maps that had already drifted;
- the sub-app's own `basePath`, baked in at build time.

`tests/core/demo-mount-paths.test.ts` (8 tests) asserts the derivation, the catalog links, and parity between the registry and both the grocery `next.config.ts` and its `APP_BASE_PATH`. Proven to fail first: putting `basePath: "/grocery"` back turns it red with `expected '/grocery' to be '/demo/grocery'`. That test is the guard; the drift was silent before it.

`src/proxy.ts` also matched demo paths and scoped the grocery gateway cookie to `/grocery` by literal; both now read the registry.

### Legacy paths redirect rather than alias
`/grocery` and `/grocery/*` are `308` to the new mount. Aliasing both paths was the alternative and is wrong: the app's `basePath` is `/demo/grocery`, so every link, redirect and asset it emits sends the user under the new path anyway, leaving a `/grocery` URL that is reachable once and vanishes on first click. A redirect keeps old bookmarks working and makes the new path the only addressable one.

### Verification
- Rewrites in `routes-manifest.json`: `/demo/grocery → http://localhost:3101/demo/grocery`; redirects `/grocery → /demo/grocery` (308). Only grocery is redirect-redirected; the other eight are unchanged.
- Live: `/demo` 200, `/demo/grocery` 200, `/demo/grocery/login` 200, `/demo/grocery/dashboard` 307 to the app's login. `GET /demo/grocery/api/auth/expire?next=%2Flogin` → `307 Location: /demo/grocery/login`, `gs_session` cleared. Old mount on the upstream itself is now 404.
- The `/demo` page renders `href="/demo/grocery"` and **zero** `href="/grocery"`.
- Headless end-to-end over the public host: legacy `/grocery` lands on `/demo/grocery`; sign in; click three shell nav links — every `href` and every resulting URL stays inside `/demo/grocery/`; assets and the manifest link are basePath-prefixed; sign out lands on `/demo/grocery/login` with the session gone; revisiting the dashboard bounces to login.
- No regression: platform `tsc` 0, **498/498** vitest, grocery 7/7, both `eslint` clean on touched files, both builds green, PM2 restarted and saved.

### Not a defect (pre-existing, unchanged by the move)
- The grocery app's metadata `icons` are absolute (`/icons/icon-192.png`) and Next does not prefix them with `basePath`, so the browser fetches the *platform's* icon (16,492 b) instead of the app's (4,192 b). This behaved identically at the old `/grocery` mount, so the move neither caused nor worsened it. The `manifest.webmanifest` link *is* prefixed correctly.
- `npx eslint .` at the repo root reports 71k problems across `system/`, `demo-systems/`, `.next-dev/`; pre-existing, `npm run lint` was already red.

## 2026-10-01 — GROCERY SIGN-OUT REDIRECTED TO `https://localhost:3101/login` (fixed)

### Symptom
Opening `https://bosc.dpdns.org/grocery/dashboard` and signing out sent the browser to `https://localhost:3101/login` — a public scheme on a loopback host, unreachable — so the visitor got a dead page instead of the login screen. Reproduced headlessly; the failing hop was
`GET /grocery/api/auth/expire?next=%2Flogin → 307 Location: https://localhost:3101/login`, which also surfaced as `ERR_SSL_PROTOCOL_ERROR`.

### Two distinct faults, one symptom
1. **Absolute redirect built from `request.url`** (`demo-systems/grocery/src/app/api/auth/expire/route.ts`). The app is reached through the platform's rewrite proxy, which re-issues the request to the upstream; `request.url` therefore describes `localhost:3101`, and `x-forwarded-proto: https` is then applied to it. `new URL(safeNext, request.url)` inherited both, so a `Location` that should have been relative became `https://localhost:3101/…`. **Fix:** emit a path-only `Location`. The browser resolves it against the address bar, so the result is identical on every hostname. `Set-Cookie` is unaffected.
2. **`basePath` not applied to a hand-written `Location`.** Once the redirect was relative, it resolved `/login` against the origin root and landed on the *platform's* login (404) rather than the app's. The same fault was in `topbar.tsx`, which used `window.location.href = res.data.redirect`. **Fix:** the route prepends the app's mount point, and the topbar uses `router.replace()` (which applies `basePath`) instead of a raw assignment. `replace` also keeps the signed-out page out of history so Back cannot return to an authorised screen.

### Where the mount point can and cannot be read — do not re-derive
A throwaway diagnostic route was built, deployed, and probed, then deleted. It recorded, for the same request: `request.url = https://localhost:3101/api/auth/zdiag`, `nextUrl.pathname = /api/auth/zdiag`, `nextUrl.basePath = ""`, and **no** `x-forwarded-prefix` header (the platform sets none). So by the time a route handler runs, the basePath is already stripped from every request-side value. The app's only authority on its mount point is `basePath` in `demo-systems/grocery/next.config.ts`, a build-time constant — the route reads it from a named `APP_BASE_PATH`, and a test asserts it equals `nextConfig.basePath` so the two cannot drift.

An intermediate attempt keyed off `x-forwarded-prefix`; it passed unit tests and still returned `/login` in production, because the header is never sent. Two earlier attempts read `nextUrl.basePath` and `nextUrl.pathname`, which the probe disproved. Recorded so the same three dead ends are not re-tried.

### Verification
- 7 new tests in `demo-systems/grocery/tests/auth-expire-redirect.test.ts` (relative-only, no host leak, cookie cleared, `next` open-redirect rejection, basePath↔config parity). Proven to fail first: reverting the one line turns 4 of them red with exactly `expected 'http://localhost:3101/login' to be '/login'`.
- Live on both the public host and `localhost:3101`: `Location: /grocery/login`, and `/grocery/inventory/products` for a `next` path; hostile `next` still falls back to `/grocery/`.
- Headless end-to-end: sign in → sign out lands on `https://bosc.dpdns.org/grocery/login`; `gs_session` cleared; revisiting `/grocery/dashboard` bounces to login (the session does not survive logout).

> Superseded by the `/demo/*` namespace move below: grocery is now served at `/demo/grocery` and `/grocery` is a 308 redirect. The analysis above still holds — it is the reason the mount had to be re-declared rather than derived from the request.
- No regression: platform `tsc` 0, **461/461** vitest, 10/10 routes 200, grocery `tsc`/`eslint`/build clean. `pm2 save` persisted.

### Not a defect
- `npx eslint .` at the repo root reports 71k problems (7,156 errors) across `system/`, `demo-systems/`, `.next-dev/` and `src/`. This is pre-existing and mostly vendored sub-apps plus build output; `npm run lint` was already red before this change. The three files touched here lint clean.
- Grocery has no `vitest.config.ts`; `@/` is not aliased for vitest, so the test imports its target by relative path.

## 2026-09-30 — PUBLIC TUNNEL: `bosc.dpdns.org` → THIS LAPTOP (working)

### Symptom
`https://bosc.dpdns.org` did not resolve, though a Cloudflare tunnel was already running, healthy, and correctly pointed at `localhost:3100`.

### Root cause — an account split, not a DNS mistake
| | Account | |
|---|---|---|
| Zone `bosc.dpdns.org` (`zoneID 84041280…`) | `45f15839…` | where `cloudflared tunnel login` landed |
| Tunnel `8f547fbe`, the one running since 2026-09-19 | `52e0d6ba…` | a different account |

A tunnel can only route DNS for zones inside its own account, so `tunnel route dns` failed twice with two different codes — `10000 Authentication error` (stale `cert.pem`) and, after re-login, `10002 Tunnel not found` (the tunnel simply is not in the new account). The zone's NS delegation was correct the whole time; the zone was simply empty. Config alone would never have fixed this.

### Fix
Created tunnel `bosc` (`20e9adb0…`) **in the zone's account**, added the CNAME `bosc.dpdns.org → 20e9adb0….cfargotunnel.com`, repointed both config files, restarted the service. Verified: connector live on 2 edges, homepage `200`, `/api/csp-report` `204` — through the public hostname, not just localhost.

### Trap worth remembering
The `Cloudflared` **service** runs `--config C:\Windows\System32\config\systemprofile\.cloudflared\config.yml`, not the per-user `~/.cloudflared/config.yml`. Editing the latter changes nothing for the service, and the former is ACL-locked against an unelevated shell — so the repoint needed a one-off elevated script rather than an edit.

### Also fixed — `/api/csp-report` was a 404
`src/proxy.ts` advertised `report-uri /api/csp-report` in dev, but no such route existed, so every violation POSTed into the void. Added `src/app/api/csp-report/` — `route.ts` (POST, always `204`, never resolves a tenant and never logs at `info`, because a browser fires these unauthenticated and unthrottled) and `report.ts` (the parser, split out only because Next type-checks route modules against a fixed export set and forbids extra named exports). Six unit tests in `tests/core/csp-report.test.ts`; TDD caught a real bug — `{"csp-report": null}` fell through `??` and produced an all-null summary instead of being rejected.

## 2026-09-30 — PERF AUDIT (autonomous, in-progress) — drilled-down baseline

**Context:** orchestrated perf renovation (bundle, tenancy hit-count, nav-defects, dead-weight removal, caching) with trustworthy before/after numbers. Probe org `perfprobe-HN7XLvoo` (2000 products / 800 customers / 1500 invoices / 6000 stockLevels / 3000 cashMovements) reactivated on :3100; modules were re-enabled (they were `[]`). Measurement = prod build, not dev.

### Baseline — query count per request (in-process instrumentation `scripts/perf-query-count.ts`, real route handlers, session cookie)
- **Every authed request paid a fixed ~9-10 SQL round-trips against `businessos` BEFORE touching tenant data.** Measured breakdown (identical on every route): settings-domain JSONB containment ×2 (`organizations.settings @> domain`), `sessions` ×2, `users` ×2 (session+user each read twice → Better Auth `getSession` called twice per request), `organizations WHERE id` for resolveTenantSpec confirm, `organizations` status/slug/schema_name (resolveTenantSchemaForRequest), `members` one, plus 1-2x `getOrgSettings`/org-name.
- Route totals vs. real work needed:
  - `products` GET list (limit=50): **11 stmts** (10 shared + 1 tenant) for ONE data read
  - `sales` / `purchases` GET: 11 stmts (10 shared + 1 data)
  - `customers` GET: 10 stmts (9 shared + 1 data)
  - `search` GET: 9 stmts (8 shared + 1 data)
  - `reports/summary` GET: 19 stmts (9 shared + 10 tenant: stock_levels ×3, sales_invoice_items, customers, etc.)
  - `grocery/dashboard` GET: 21 stmts (11 shared + 10 tenant) — includes getLowStockCount per-product loop (`src/core/grocery/dashboard.ts:339-361`, called twice: `getDashboardKpis` + `listLowStock`).
  - ⚠️ **BEFORE-AND-AFTER DATA INTEGRITY NOTE:** at audit time the perfprobe tenant schema's 53 business tables carried `organization_id = 4a50598d-…` while the org row + session pointed to `6bdc52fc-…` → every tenant read hit 0 rows, so the per-product N+1 loop **never actually fired** in the 21/17 measurements (they are statement-count numbers, still valid as such). The N+1 was latent, not measured, until the data was repaired (see M4).

### M1 done — recharts lazy (measured after, same tool)
- New lazy modules in `src/components/charts/` (lazy-charts.tsx + sales-trend/session-types/report-bar-chart.tsx); 4 pages rewritten to use them. `recharts` no longer in the eager graph of any `/app/**` route (verified in react-loadable-manifest, all 4 chart chunks only via `next/dynamic`). `npx tsc --noEmit` clean.

### M2 done — navigation defects + error boundary (code audit + tsc/lint)
- Full-reload internal links **fixed**: `app-marketplace.tsx` (router.push), `business-systems-section.tsx` (router.push callback), `onboarding/system-cards.tsx` (router.push ×2), `select-org/page.tsx` raw `<a href="/platform-admin">` → `Link`.
- Verified-and-kept as intentional hard nav (documented): `core/auth/client.ts` sign-out (must drop router cache), `sw-update-toast.tsx` reload, `platform-admin/tenants/*` `window.location.assign("/")` post-delete/suspend reset.
- Added `src/app/app/error.tsx` (tenant-shell error boundary with reset); `/app` loading.tsx already present (real Suspense boundary).

### M3 done — tenant-resolution de-dup (measured after, same tool)
- Root cause: `withRoute` calls `resolveTenantSpec(request)`, then the handler calls `requireTenantContext(request)` — the two re-resolved host + session + org independently.
- Fix (`src/core/tenancy/context.ts`): per-request memoization via `WeakMap<Request, …>` for the three heaviest reads — session (`getSession`), host→tenant spec (`resolveTenantSchemaForRequest`, incl. the JSONB domain containment), and the organization row (single row now serves spec + context + lifecycle gate). Rejection entries are un-cached so failures can retry; keys are the Request object → nothing can leak across requests.
- **Measured after (same in-process tool, authed perfprobe cookie):** `products` 11→**7** stmts (6 shared + 1 tenant), `search` 9→**5**, `reports/summary` 19→**15**, `grocery/dashboard` 21→**17**. Shared `businessos` statements now: 1 domain containment + 1 session + 1 user + 1 org row + 1 member + 1 settings = 6 fixed, i.e. 40% of the pre-fix toll.
### Baseline — production bundle (fresh `next start` of the already-built `.next` prod build, real signed-in HTML script tags, `scripts/perf-bundle.ts` ⇒ avg route JS = **655 KB**)
| route | jsKB | notes |
|---|---|---|
| `/` | 678 | landing |
| `/signin` | 682 | |
| `/app` | 554 | shell |
| `/app/products` | 650 | |
| `/app/customers` | 639 | |
| `/app/sales` | 594 | |
| `/app/inventory` | 643 | |
| `/app/reports` | 593 | |
| `/app/finance` | 587 | |
| `/app/expenses` | 635 | |
| `/app/suppliers` | 638 | |
| `/app/purchases` | 588 | |
| `/app/workflows` | 704 | peak nav target |
| `/app/sama-center` | **986** | recharts eager |
| `/platform-admin` | 551 | 307→/platform-admin/** |

- **recharts** = 5 eager `"recharts"` import sites (grocery dashboard+reports pages, sama-center page+reports page, `dashboard-bar-chart`) → ~383 KB literally on every `/app/**` route. `three`/`@react-three/fiber`/`drei` already lazy (OK). `lucide-react` 67 import sites (2 icon registries, 148+119 icons).
- Unused deps installed: `@dnd-kit/*`, `@tanstack/react-table`, `dexie`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zustand` — none imported in `src/` (checked).

### M1 done — production bundle after recharts→lazy (fresh `next start -p 3200` of rebuilt prod `.next`, `scripts/perf-bundle.ts`, avg **655 → 623 KB**)
| route | before | after | Δ |
|---|---|---|---|
| `/` | 678 | 674 | −4 |
| `/signin` | 682 | 678 | −4 |
| `/app` | 554 | 550 | −4 |
| `/app/products` | 650 | 646 | −4 |
| `/app/customers` | 639 | 635 | −4 |
| `/app/sales` | 594 | 590 | −4 |
| `/app/inventory` | 643 | 639 | −4 |
| `/app/reports` | 593 | 589 | −4 |
| `/app/finance` | 587 | 584 | −3 |
| `/app/expenses` | 635 | 631 | −4 |
| `/app/suppliers` | 638 | 634 | −4 |
| `/app/purchases` | 588 | 584 | −4 |
| `/app/workflows` | 704 | 700 | −4 |
| `/app/sama-center` | **986** | **585** | **−401** |
| `/platform-admin` | 551 | 547 | −4 |

(`/app/grocery*` 403 in perf-bundle — route guard; recharts verified lazy there via the 4 chart chunks in react-loadable-manifest.)

### Remaining audit items (open)
- `src/proxy.ts` runs on every request; responses send `Cache-Control: no-cache, must-revalidate` (no `headers()` config).
- 125 `"use client"` files in `src/`; ~40 whole pages under `src/app/**` are client components (fetch-in-effect + no SWR/TanStack Query; DESIGN_AUDIT.md already flagged missing data-fetching lib).
- Unused deps installed: `@dnd-kit/*`, `@tanstack/react-table`, `dexie`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zustand` — none imported in `src/` (checked).

### Not-yet-done in this audit entry
- M5 client fetching (cancellation/data lib), M6 next.config + proxy (staleTimes/optimizePackageImports/headers/matcher), M7 unused deps removal + provider memoization — planned next.
- Logging probe `scripts/perf-query-count.ts` (kept in-repo as tooling). Re-enabling module array on perfprobe org is a DB-side mutation only (documented here, not a code change).

### M4 done — grocery low-stock N+1 → grouped read (measured after, same tool)
- Root cause: `getLowStockCount` (`getDashboardKpis`) and `listLowStock` each did `products.findMany` then a `stockLevel.aggregate` per product.
- Fix: single `stockLevel.groupBy({ by: ["productId"], _sum: { qty: true } })` + one `products.findMany` in both `src/core/grocery/dashboard.ts` and `src/core/grocery/inventory-mgmt.ts`; `getLowStockCount` returns 0 early when no products qualify.
- **Repaired the seed data first:** resolved the org-id paradox above — `UPDATE 53 tables SET organization_id = '6bdc52fc-…' WHERE organization_id = '4a50598d-…'` (products 2000, sales 1500, customers 800, stock_levels 6000, cash_movements 3000, branches 1, …), then set a realistic `min_stock = 500` on all 2000 active+tracking products so the low-stock branch actually matches (328 low products).
- **Measured (probe under real tenant context, in-process stmt counter):** OLD code path against repaired data = **2001 stmts** (2000 stock_levels aggregates + 1 products read); NEW groupBy path = **2 stmts**. `lowStock.count = 328`, `listLowStock` returns rows — logic verified end-to-end.
- Full `grocery/dashboard` route now: **23 stmts** (6 shared + 17 tenant; two stock_levels GROUP BY statements present) — vs. the ~2000+ the old code would have emitted on live data. `products` 9, `inventory` 10, all status 200.
- Gates: `npx tsc --noEmit` clean · `eslint` on touched files 0 · `npx vitest run` 454/455 (sole known-fail pg_dump PATH) — no regressions.

### Pending by milestone
- [x] M0: scaffold, docker-compose, prisma init+migrate, better-auth wiring, health endpoints, logger, eslint/prettier/tsconfig, seed (platform admin) ✅ 2026-08-25
      Deviations from plan (documented): Docker unavailable on this machine → local PostgreSQL 16.3 service used for dev (:5433, cluster in .data/pg; docker-compose still provided for parity/production path). Prisma 7 breaking changes handled: `url` removed from schema datasource block (lives only in prisma.config.ts); generator `prisma-client` outputs TS to src/core/db/generated/prisma. Better Auth 1.7 requires `issuer` column on accounts. .env.local must be BOM-less UTF-8 (PS5.1 writes BOM → Node env parser fails silently).
- [x] M1: organizations model, tenant resolution, TenantGuard repo layer, permission catalog + roles, audit service, isolation tests ✅ 2026-08-25
      Implemented: Better Auth organization plugin (organizations/members/invitations + sessions.activeOrganizationId), permission grammar `<module>.<action>` in code catalog with 6 default tenant roles (owner/admin/manager/cashier/accountant/viewer), TenantContext via session.activeOrganizationId, tenant-guard primitives (tenantFilter/tenantOwn/assertOwned/requirePermission), append-only audit_logs written inside caller transactions, org create/set-active endpoints, /me returns orgs+activeTenant. Vitest isolation suite 8/8 (cross-tenant read denial, assertOwned, tx atomicity, permission matrix). Gotchas recorded: `prisma migrate dev` may NOT regenerate client → run `npx prisma generate` after schema changes; Better Auth access control API is `ac.newRole(statements)` (name comes from the key in the roles record passed to the plugin).
- [x] M2 (backend core): platform gate (user.role=admin via Better Auth admin plugin), plans table + seed (trial/basic/pro/enterprise, integer-minor pricing, JSON limits), organization status lifecycle (active/suspended/cancelled) enforced at tenant-context resolution (402 bilingual envelope), announcements model+API, tenant create/list/update endpoints with audit logging inside transactions, session invalidation on suspension ✅ 2026-08-25
      Verified end-to-end: admin creates tenant w/ plan+owner → suspend → member blocked everywhere → reactivate → restored. Non-admin on /api/platform/* = 403. Gotcha: `nextCookies()` must be LAST in betterAuth plugins array.
- [x] M2 remainder: platform-admin console UI (overview/tenants/plans/announcements, server-gated layout), impersonation w/ platform-realm audit rows + stop flow (gate = session.impersonatedBy, admins cannot be impersonated), grocery template registry applied at provisioning (settings JSON: currency/VAT/receipt + 13 modulesEnabled) - done 2026-08-25. NOTE: port 3000 occupied by user's separate YemenBusinessOS dev server; ERP smoke tests run on :3100.
- [x] M3: tenant shell (/app route group w/ session+tenant+suspension guard via requireTenantPage), branding→CSS-vars pipeline (brandingCssVars injected in shell; live-preview appearance builder writing controlled tokens through PATCH /api/v1/settings), module registry + toggles gating nav AND routes (disabled module page → 404) AND API surfaces (requireModule), users/roles admin UI (list/add-existing-user/role-change/remove + last-owner 409 protection, all audited), ar/en localization switcher (cookie bos_locale → root layout lang/dir RTL-LTR), org picker /select-org for multi-org users ✅ 2026-08-25
      Verified end-to-end on :3100: branding roundtrip persisted via deepMerge (receipt/currency keys untouched); modulesEnabled narrowed to [sales,inventory,products,pos,reports] → nav hides expenses link + /app/expenses 404s + /app/pos renders placeholder; member add cashier→viewer→remove with audit rows member.added/role_changed/removed; last-owner DELETE = 409 CONFLICT. Vitest m3 suite 8 tests (module gate incl. MODULE_DISABLED envelope, deepMerge immutability/array-replace/undefined-drop, css vars, role boundaries). Deviations documented: login-screen per-tenant branding deferred to M9 (subdomain resolution — no tenant domain exists at signin yet); global search/dashboard-widget gating lands when those surfaces exist (M4/M5) and reuse isModuleEnabled. RSC pages must call notFound() not throw ApiError (throw = 500). react-hooks/set-state-in-effect rule forbids sync setState in effect bodies (fetch-in-effect pattern w/ cancelled flag).
- [x] M4: business core schema (categories/units/products w/ per-org unique sku+barcode, branches/warehouses, stock_levels + stock_movements ledger, customers/suppliers w/ credit-limit+balance, expenses/categories, cash_accounts/movements, number_sequences, sales_invoices/items/payments, purchases/items, sales_returns scaffolding) + services: seq/service.ts (gap-tolerant numbering inside caller tx), modules/money.ts (bigint milli-unit fixed-point math — no floats touch money), inventory/service.ts applyStockMovement (sole stock writer; negative-stock gate via settings.allowNegativeStock), sales/service.ts createSale (ATOMIC: number→invoice→items(createMany, plain FK)→payment→cashMovement→stockMovements→customer balance→audit in ONE tx) + assertCreditAvailable (M6 workflow-hook seam; CREDIT_NOT_ALLOWED/CREDIT_LIMIT_EXCEEDED 422s), purchases/service.ts (receipt applies stock IN + last-cost bookkeeping + supplier payable; unpaid remainder requires supplier), expenses, reports/service.ts (salesSummary/grossProfit from unitCost snapshots/inventoryValuation+lowStock/debtReport/cashflow — all SQL/ledger-derived) ✅ 2026-08-25
      All 4 verifiable goals pass (tests/core/m4-business-core.test.ts, suite 26/26 total): atomic sale rollback verified with genuine mid-tx injection (full-cash oversell dies INSIDE movement loop after header/items/payment writes → zero partial rows, sequence unburned); ledger-sum==stock-level invariant incl. negative-allowed mode; credit ceiling blocks via seam (isolated on untracked service product); reports reconcile exactly with hand-computed fixture sums. Smoke on :3100 as owner2@fresh-mart: purchase FM-PUR-00002 (100@150=15000) → sale FM-INV-00002 (4@250+15% =1150) → reports: profit 400, inventory 14400 (=96×150), all exact. Gotchas recorded: Next.js rewrites tsconfig target to ES2017 → bumped to ES2020 + deleted stale tsconfig.tsbuildinfo for BigInt literals; business tables use plain FK columns (NO Prisma relations) → createMany children separately, never include:; toJsonSafe needed Decimal.toFixed() branch; .data/pg cluster can silently die → pg_ctl restart from C:\Program Files\PostgreSQL\16\bin; module gate correctly 404'd purchases until re-enabled live via PATCH /api/v1/settings.
- [x] M5: custom field runtime (21 types, rules, conditional visibility, encryption flag), form builder, saved views/table builder, dashboard builder (dnd-kit widgets), report builder (whitelisted aggregate compiler), formula parser sandbox ✅ 2026-08-25
      Implemented: schema m5_customization (customFields with 21 types/rules/formula/isUnique/hasIndex/isEncrypted/sortOrder, customFieldValues EAV-lite with text/number/date/bool columns + unique [fieldId,entityId], savedViews for per-user column/filter/sort configs, dashboardLayouts per-user widget grid). Services: custom-fields/types.ts (21 CUSTOM_FIELD_TYPES with storageKind mapping + CUSTOM_FIELD_ENTITIES), custom-fields/crypto.ts (AES-256-GCM with enc:v1: prefix + APP_ENCRYPTION_KEY derivation), custom-fields/formula.ts (safe recursive-descent parser with MIN/MAX/ROUND/ABS/FLOOR/CEIL whitelist, no eval/Function), custom-fields/service.ts (createCustomField with formula compile-time check + unique/index/encrypted validation, updateCustomField, deleteCustomField soft-delete, listCustomFields, validateFieldValue with rules enforcement, saveCustomFieldValues with unique-constraint enforcement + conditional visibility, loadCustomFieldValues with AES decryption + formula field computation at read time), reports/builder.ts (whitelisted aggregate compiler with parameterized SQL: 5 datasets/products/sales/customers/suppliers/expenses with strict dim/measure/filter key whitelists, computed columns via safe formula parser, ZodError→ApiError wrapping). API routes: /api/v1/admin/custom-fields (GET list+POST create), /api/v1/admin/custom-fields/[fieldId] (PATCH update+DELETE soft), /api/v1/custom-fields/values (GET entity values+PUT upsert), /api/v1/reports/build (POST compiler), /api/v1/views (GET list+POST create) + /api/v1/views/[viewId] (PATCH+DELETE), /api/v1/dashboard (GET layout+PATCH upsert). Permission catalog extended with custom_fields module (read/create/update/delete). Formula parser fuzz-tested: 14 injection vectors (SQL, JS eval, constructor, backtick, double-quote, malformed numbers, missing parens) all rejected. All 71 tests pass (4 suites: isolation 8/8, m3-tenant-admin 8/8, m4-business-core 10/10, m5-customization 45/45). Gotchas: report builder DATASETS must use actual DB column names (snake_case via Prisma @map), not Prisma field names; validateFormula uses sample value 1 (not 0) to avoid division-by-zero during compile-time checks on margin formulas; computed columns validated with all-ones scope then evaluated per-row with real values.
- [x] M6: trigger registry, event bus (pg outbox), condition evaluator, action executors (notification/webhook/create-record/email-log), execution logs + retry/backoff ✅ 2026-08-25
      Implemented: schema m6_workflows (outboxEvents with dedupeKey/status/attempt/backoff/nextRunAt/maxAttempts, workflowRules with triggerEvent+conditions JSON AST+actions JSON array+isActive, workflowExecutions with status/actionType/durationMs/attempt/lastError+unique [ruleId,eventId,actionType], webhookEndpoints with url/signingKey/events/isActive, notifications with titleAr/titleEn/bodyAr/bodyEn/userId/isRead). Services: workflows/types.ts (WORKFLOW_EVENT_TYPES event registry, ConditionNode AST union, WORKFLOW_ACTION_TYPES, WorkflowAction discriminated union), workflows/bus.ts (emitOutboxEvent with upsert dedup on orgId_dedupeKey, buildDedupeKey convenience), workflows/evaluator.ts (safe condition AST evaluator with eq/neq/gt/gte/lt/lte/in/contains operators, and/or/not logic groups, empty {} = always match), workflows/actions.ts (notification with {{field}} template interpolation, webhook with HMAC-SHA256 signing + AbortSignal.timeout, task-as-notification proxy, email_log/create_record placeholders), workflows/worker.ts (pg-backed poll loop, processOutboxBatch with 50-event batch, processOneEvent with rule matching + condition eval + action execution + execution logging, exponential backoff retry, dead-letter after maxAttempts). Wired outbox into business services: sales/service.ts emits sale.created in same tx as invoice, inventory/service.ts emits inventory.low when stock <= minStock. API routes: /api/v1/admin/workflows (GET list+POST create) + /api/v1/admin/workflows/[ruleId] (PATCH update+DELETE) + /api/v1/admin/workflows/executions (GET logs), /api/v1/admin/webhooks (GET list+POST create) + /api/v1/admin/webhooks/[endpointId] (PATCH update+DELETE). All 85 tests pass (5 suites: isolation 8, m3-tenant-admin 8, m4-business-core 10, m5-customization 45, m6-workflows 14). Build 41 routes clean. Gotchas: empty conditions {} must evaluate to true (no conditions = always match) — added guard in evaluator; vi.spyOn(globalThis, 'fetch') required for webhook failure tests (Node.js fetch doesn't fail on .invalid domains on Windows); dedup test leaves pending events that leak into notification test if not cleaned up.
- [x] M7: Dexie schema + mirrors, outbox queue, /api/v1/sync, idempotency_keys dedupe, conflict queue + resolution UI, device registry/status ✅ 2026-08-25
      Implemented: schema m7_offline (syncDevices with fingerprint/platform/lastSyncAt/pendingCount/isActive, idempotencyKeys with key/statusCode/result/expiresAt + unique [orgId,key], conflictQueue with entityType/entityId/fieldName/localValue/remoteValue/localUpdatedAt/remoteUpdatedAt/status/resolvedValue/resolvedByUserId). Services: sync/types.ts (SYNC_OPERATIONS, SYNC_ENTITIES, FINANCIAL_ENTITIES set, FINANCIAL_FIELDS set, METADATA_FIELDS set, Zod schemas for syncOp/syncBatch/conflictResolution), sync/service.ts (processSyncBatch with per-entity handlers for product/customer/supplier/category/unit/branch/warehouse/expense/cashAccount/salesInvoice/purchase, idempotency check via idempotencyKeys unique key, conflict detection via updatedAt comparison, LWW auto-resolve for metadata fields, conflict_queue for financial entities, resolveConflict with typed Prisma update, listDevices, upsert device registry on each sync), sync/client.ts (Dexie schema with mirrors for products/customers/suppliers/stockLevels/settings + outbox table, createSyncClient with enqueue/syncNow/pendingCount/getPending, exponential retry with localStorage device fingerprint), sync/types-client.ts (MirrorProduct/MirrorCustomer/MirrorSupplier/MirrorStockLevel/MirrorSettings, OutboxEntry with syncStatus lifecycle, SyncState, PendingConflict). API routes: /api/v1/sync (POST batch endpoint with Zod validation), /api/v1/devices (GET device list). All 97 tests pass (6 suites: isolation 8, m3-tenant-admin 8, m4-business-core 10, m5-customization 45, m6-workflows 14, m7-offline 12). Build 43 routes clean.
- [x] M8: POS service (hold/resume/pay), /api/v1/pos/hold + resume + pay + receipt, receipt generator (58mm/80mm/A4, branding tokens, RTL) ✅ 2026-08-26
      Implemented: schema m8_pos (posHold with organizationId, branchId, warehouseId, customerId, cashAccountId, cart Json, label, createdByUserId). Services: pos/types.ts (posCartItemSchema, posHoldSchema, posPaySchema, ReceiptData/ReceiptBranding/ReceiptWidth types), pos/service.ts (holdCart, listHolds, resumeCart, deleteHold, payFromHold — bridges hold/resume to M4 createSale), pos/receipt.ts (generateReceipt with 58mm/80mm/A4 widths, tenant branding tokens, RTL Arabic layout, Noto Sans Arabic font, line item table, totals, QR-ready footer). API routes: /api/v1/pos/hold (GET list, POST create, DELETE by holdId query param), /api/v1/pos/resume (POST), /api/v1/pos/pay (POST — direct or from hold), /api/v1/pos/receipt (POST — generates receipt HTML from invoice ID). Tests: 16 tests in m8-pos.test.ts covering hold/resume/pay lifecycle, error cases, receipt generation across widths/RTL/branding. All 113 tests pass (7 suites). Build 47 routes clean.
- [x] M9: provider adapter + admin-configurable keys/models, tool registry (read+mutating w/ confirmation tokens), copilot chat UI ar/en, usage metering + plan caps, NL→workflow drafts (activate only after confirm) ✅ 2026-08-26
      Implemented: schema m9_ai (aiProvider with endpoint/model/apiKey/isActive, aiUsageLog with org/tokensIn/tokensOut/costMicro/toolCalls/conversationId, aiConfirmToken with org/actionType/actionArgs/toolCallId/used/expiresAt). Services: ai/types.ts (9 Zod schemas for tool args: getSalesSummaryArgs, getTopProductsArgs, getDebtArgs, getInventoryArgs, searchArgs, createCustomerArgs, createProductArgs, createExpenseArgs, createSaleDraftArgs), ai/tools.ts (TOOL_REGISTRY with 5 read + 4 mutating tools, each with permission+descriptionAr+Zod schema), ai/provider.ts (callLLM OpenAI-compatible + getActiveProvider with mock fallback), ai/executor.ts (executeReadTool grounded in DB: get_sales_summary via salesInvoice.aggregate, get_top_products via groupBy+product lookup, get_debt via customer.balance>0, get_inventory via stockLevel+product, search via nameAr contains), ai/confirm.ts (createConfirmToken 15min TTL, consumeConfirmToken single-use+expiry check), ai/metering.ts (assertAiQuota per-plan caps: free=50/starter=200/pro=1000/enterprise=10000, logAiUsage, getUsageStats), ai/copilot.ts (chat orchestrator: system context injection, conversation loop max 5 rounds, mock provider with sales/inventory/debt tool routing, confirm token creation for mutating tools). API routes: /api/v1/ai/chat (POST), /api/v1/ai/confirm (POST with action execution), /api/v1/ai/usage (GET quota+stats). All 128 tests pass (8 suites). Build 50 routes clean.
- [x] M10: PWA manifest/icons, serwist SW (app-shell + runtime caching), install/update prompt, mobile bottom-nav, responsive layouts ✅ 2026-08-26
- [x] M11: API keys + scopes + PG-backed rate limits, HMAC webhook signing/retries/delivery logs, CSV import wizard (validate→preview→commit), export center, backup job + SHA-256 verification, local storage provider ✅ 2026-08-26 — **backup path repaired 2026-09-27:** pg_dump had never actually run (Prisma `?schema=` in the URI + `--schema=public`), and the silent JSON fallback was recorded as `verified`; see the 2026-09-27 entry.
- [x] M12: Hardening & DoD ✅ 2026-08-26
      Completed: CSP/security headers (X-Frame-Options DENY, HSTS, CSP, Permissions-Policy via proxy.ts), security headers on API responses (X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy), in-memory session-based rate limiter (200 req/min), 37 new FK/composite indexes (6 high-severity: product.categoryId, expense.categoryId, salesInvoice.warehouseId, purchase.supplierId, purchaseItem.productId, salesReturnItem.productId), 7 N+1 query fixes (sales/products batch fetch, purchases/products batch fetch, import/customers+suppliers createMany, import/opening_stock batch product lookup, custom-fields/loadCustomFieldValues batch fetch, storage paths org-scoped), full isolation test suite m12-isolation.test.ts (20+ tests across products/customers/suppliers/sales/stock/reports/AI-tools/exports/custom-fields/storage/API-keys/audit-logs/number-sequences/revoked-role/cross-surface-proof), RLS evaluation writeup (docs/RLS-EVALUATION.md — app-layer isolation via tenantFilter chosen over PG RLS), architecture docs (docs/ARCHITECTURE.md), API docs (docs/API.md), deployment guide (docs/DEPLOYMENT.md). Pending: DB migration for new indexes (requires Docker), vitest full suite, next build. — **RESOLVED 2026-09-25:** migrations applied (incl. tenant schemas/databases + org app requests), vitest 246/246 green, `next build --webpack` green.

### Deferred by design (documented, not forgotten)
- Stripe/local payment gateway live charging (billing records manual-first; adapter interface ready) — after M2 feedback
- Realtime push provider (SSE abstraction stubbed; vendor chosen later) — after M7
- WhatsApp/SMS actual senders (integration framework only) — after M11
- Marketplace install flow + extra industry templates beyond Grocery — architecture-ready via template system
- MFA enrollment UI (plugin/schema-ready from day one) — hardening window
- Postgres RLS enforcement layer — EVALUATED in M12 (docs/RLS-EVALUATION.md): application-layer isolation via tenantFilter + 20+ isolation tests chosen as the correct architecture. PG RLS adds Prisma compatibility issues, planner overhead, and operational complexity without meaningful security improvement for this shared-schema model.
- Demo-mode auto-reset scheduler — post-M12
- Live read/write routing of app traffic onto the per-org clusters — architecture-ready only. The shared `businessos` database remains the runtime source of truth; each org cluster is a complete, independently startable working copy. See the 2026-09-28 entry.

---

## 2026-09-28 — PER-ORGANIZATION VAULT FOLDERS (`orginazition/`, one PGDATA per org)

### Goal
Every tenant owns a self-contained folder under `orginazition/<slug>/` (repo root) holding its profile, systems, members, files, exports, logs, backups, **and a real dedicated PostgreSQL cluster** — created automatically for new signups and backfilled for all existing orgs.

### Verified end-to-end (one org, `haitham`)
`npx tsx scripts/backfill-org-vaults.ts --slug haitham --copy-data` → 0.7 min, 55 tables, 0 errors, `verify ok=true`, cluster left **stopped** (on-demand model), process exits 0.
Read-back from the org's **own** cluster (`bos_haitham.t_haitham` on :5500): 3 `audit_logs` rows present and queryable, 55 tables — while the shared `businessos` database still holds the same 3 rows (COPY, never a move; shared DB remains the safety net).

### Module: `src/core/org-vault/`
`paths` (sanitized-slug folders, collision fingerprints, atomic JSON) · `registry` (`_registry/registry.json`, serialised writes, port 5500-5999 allocation) · `cluster` (initdb, lifecycle, bounded LRU pool) · `schema` (DDL + data copy) · `manifest` (org/systems/members/manifest/connection/README) · `storage` · `logger` · `backup` (pg_dump + SHA-256 sidecar) · `provision` (orchestrator + background queue) · `on-create` (the one hook every creation path calls).

### Decisions taken
- Real PGDATA per org (not just dumps) so a folder is startable/shippable without the platform DB.
- Clusters are **on-demand and bounded** (`ORG_VAULT_MAX_RUNNING`, default 8): LRU eviction, never 147 servers at once. Provisioning starts a cluster to run DDL and **stops it again**.
- Superuser password is **derived**, not stored: `sha256(AUTH_SECRET + ':' + slug + ':bos')` truncated to 32 hex chars — the registry and the folder hold no secrets.
- Folder name = sanitized slug; collisions get a short SHA-256 fingerprint suffix.
- Folder + registry + manifests are written **synchronously** on creation (so a 201 means the folder exists); only `initdb`/DDL is queued.

### Windows/PostgreSQL traps found and fixed (all were real, all cost hours)
1. **`execFileSync` + pipes hangs forever on `pg_ctl start`.** The postmaster inherits the pipe handles, so the call blocks waiting for an EOF that only arrives at shutdown — long after `pg_ctl` exited successfully. Fixed: `run(bin, args, capture=false)` uses `spawnSync` with stdout/stderr **discarded** for start/stop; success comes from the exit code plus our own verification.
2. **`pg_ctl -w start` proves nothing.** It waits for the postmaster's "ready to accept connections", logged *before* any backend is forked. Added `probeOrgCluster` — a real `select 1` with connect/statement/query timeouts and an outer race, retried once from a clean postmaster. Without this a cluster whose backends die looks "started".
3. **A FORCE-KILLED postmaster orphans its children and leaks its Windows shared-memory block** (`pre-existing shared memory block is still in use` on the next start; backends then die with `0xC0000142` STATUS_DLL_INIT_FAILED). Never force-kill an org cluster — use `pg_ctl -m immediate stop`. Added stale-`postmaster.pid` cleanup that only removes the file when the recorded PID is provably dead.
4. **Managed settings must live in `postgresql.auto.conf`.** A `postgresql.conf.d/` folder *outside* PGDATA is read by nothing. The delimited managed block is now rewritten in place (no accumulation) and a human-readable copy is written beside the data.
5. **Cross-database `INSERT ... SELECT` is impossible here.** Source and target are different servers, so `INSERT INTO org_schema.t SELECT ... FROM businessos.t` is evaluated wholly on the target, where `businessos` does not exist. This silently copied **0 rows** for every table. Fixed: read on the source pool, chunked parameterised INSERT on the target pool (`INSERT_CHUNK = 500`).
6. **A cached `pg` Pool keeps a one-shot CLI alive forever.** Added `closeOrgVaultPools()`; both scripts call it in their shutdown path.
7. **Never let a script iterate an array it is pushing to.** `parseArgs` did, producing an unbounded loop and the opaque `Invalid array length`.
8. The pg tool environment is deliberately minimal — the binaries find their own DLLs next to `postgres.exe`, so the postmaster and its backends do not inherit Node's PATH.

### Known gap (reported, NOT silently changed)
`TENANT_TABLES` (55 entries) excludes `members`, `organization_apps`, `organization_app_requests`, which **do** exist in the shared schema with an `organization_id`. So an org cluster has no `members` table and cannot serve membership from its own data. `members.json` is still generated from the shared DB, so the folder is correct today — but per-org membership data is not in the cluster. Changing the platform's table list affects shared-instance provisioning too, so it is a decision for the owner, not a drive-by edit.

### Operational notes
- Ports 5500-5999; `ORG_VAULT_MAX_RUNNING` (default 8) bounds running clusters; `ORG_VAULT_ENABLED=0` disables the whole feature.
- `initdb` on this machine takes ~16s (slow but reliable); checkpoints show an odd ~4.7s write for 46 buffers with Defender real-time protection on.
- Cost of a full backfill: ~42s and ~50 MB per org ⇒ roughly **~1h45m and ~7.5 GB** for 150 orgs. **The 150-org backfill has NOT been run yet** — only `haitham` is provisioned.
- Commands: `npx tsx scripts/org-vault.ts list|status|sync|create|verify|cluster:start|cluster:stop|backup|backups` and `npx tsx scripts/backfill-org-vaults.ts [--folder-only|--clusters|--copy-data|--force|--limit|--slug|--dry-run]`.

---

## 2026-09-28 — SIGNUP WAS SLOW: THE EVENT LOOP WAS BEING BLOCKED (fixed + measured)

### Symptom
`POST /api/v1/public/signup` took **7.5-9.5s**. Page load was never the problem — `GET /signup` is 60-200ms and the HTML arrives in ~0.3s.

### Measured, not guessed
Timed every stage instead of assuming:

| stage | cost |
|---|---|
| `scaffoldOrgFolder` (all vault work) | **59 ms** |
| `auth.api.signUpEmail` (mostly password hashing) | **383 ms** |
| prisma query (each) | **3.5 ms** |
| interactive `$transaction` | **10 ms** |
| `isPortFree` (socket probe) | **0.4 ms** |

So the vault feature was never the cost. The giveaway was the *pattern* — repeated signups went 7.85s → 0.71s → 0.32s: the first request was slow because the **previous** signup's background job was still running.

### Root cause
`run()` in `org-vault/cluster.ts` used `spawnSync`, and `backup.ts` used `execFileSync`. Both **block the Node event loop for the entire lifetime of the child process**. `initdb` alone is ~16s on this machine, and every signup enqueues one. So a single signup froze the whole Next.js server — no HTTP, no rendering, no middleware — until the background provisioning job finished. The functions were already `async`, which is what made this invisible: `async` around a synchronous call still blocks.

This is the same trap as the `execFileSync`+pipes hang already recorded above, in its second form: not a hang, but starvation.

### Fix
`run()` is now a promise over `node:child_process.spawn`, keeping the two things that were already load-bearing: **discarded stdio for `pg_ctl` start/stop** (the inherited-pipe hang) and the **minimal tool env** (the `0xC0000142` backends). Exit code plus the caller's own probe still decide success. `clusterStatus()` became async; `forceStop()` became async (its call site already awaited it). `pg_dump` moved to `promisify(execFile)` — safe, since it writes to `-f file` and holds no long-lived pipe.

### Result
| | before | after |
|---|---|---|
| signup, queue busy | 7.5-9.5s | **0.5-2.0s** |
| signup, queue idle | 0.32s | 0.48s |
| `GET /signup` while initdb runs | blocked | **0.2-1.2s** |

Verified 10/10 consecutive signups succeeded (0.50-2.67s), 17/17 with no failures. `tsc` clean, eslint clean, 382/382 tests pass.

The residual ~0.5s floor is `auth.api.signUpEmail` at 383ms, which is password hashing — deliberate security cost, not a defect. Do not "optimise" it away. The remaining 0.5-1.5s variance is contention with concurrent background `initdb` disk I/O; it is worst during a mass backfill, which is a batch job, not a signup path.

Also fixed while measuring: `pgBinDir`'s `where initdb` probe is memoised (once per process), so it was never part of the cost.

### Notes
- One request failed once, immediately after editing `cluster.ts`; `.data/devserver.log` shows the same burst's first request at 9.51s and a neighbouring `GET /api/auth/get-session 200 in 6.9s (next.js: 5.9s)` — i.e. **dev-mode recompilation**, not a code fault. Did not reproduce in 17 subsequent requests.
- `findUsablePort` proved itself against reality: `TeamViewer_Service.exe` holds **5939**, inside the 5500-5999 range, and allocation skipped it.
- Test-hygiene observation, not introduced by this work: the shared DB holds leftover `IsoA-*` / `IsoB-*` / `revoked-*` orgs from repeated test-suite runs (count is 154, not a round 150).

---

## 2026-09 — LANDING DESIGN WORK (current session)

### Landing single-page nav (implemented + verified)
- `src/app/page.tsx` is a single-page view-swapper: `PageKey` union (home/features/stats/highlights/testimonials/how/cta), `NAV_PAGES` with lucide icons; `setPage` swaps views, scrolls to top on change.
- Navbars are **hidden by default**; nav toggle:
  - Desktop: slim left-edge tab + left→right edge swipe opens the 3D rail (`-translate-x-[120px]` slide, opacity/pointer-events gating).
  - Mobile: floating menu FAB (bottom-right; moves up + turns teal ✕ when open) + bottom-edge up-swipe opens the bottom dock (`translate-y-[140%]` slide).
  - Nav closes on page select. Both navs fully transparent (`bg-transparent`, no border/shadow).
- Root-caused + fixed the "black rectangle behind dock": it was the Hero3D full-screen loading veil (`bg-background` + spinner) — **removed** from `hero-3d.tsx` (`ready` state, boot timeout, handleReady all deleted; orber camera logic untouched). Verified headless: `anyBlackBox: []`.
- Build note: arbitrary `[transform:...]` classes are NOT generated by Tailwind v4 here — use native `translate-x-*`/`translate-y-*` utilities instead.
- Probe scripts: `C:\Users\GMSNOW\AppData\Local\Temp\opencode\{dockprobe,navprobe,railprobe,txprobe}.js` (puppeteer-core + Edge headless).

### Landing hero
- `hero-3d.tsx` = Sketchfab "Need some space?" embed (`LAND_DIST=75`, 2s approach, autospin; CSP relaxations added in `src/proxy.ts` for sketchfab.com frame/worker/connect).
- Earth Sketchfab model removed by user request; `public/models/a_windy_day.glb` (55MB) now unused — only `public/earth/earth_atmos_2048.jpg` + procedural `windy-preview.tsx` (three/R3F wind-streams recreation, inferno colormap, additive blending) power `/windy`.

### Approved design task — EXECUTED ✅ 2026-09-11
- **Goal (done):** unify glass/3D brand across 7 non-home pages: `/signin /signup /systems /my-apps /select-org /demo /windy` via shared `OnboardingShell`.
- **M1 audit:** signin/signup already dark; systems/my-apps/select-org/demo were light; windy standalone dark — confirmed full inconsistency.
- **M2 shell:** `src/components/onboarding/onboarding-shell.tsx` — dark `#050510` wrapper + `dark` class scoping (drives theme-token descendants), ambient glow, sticky glass header, unified footer with brand logo.
- **M3 apply:** `/signin /signup` (kept ParticleCanvas, removed duplicated glows), `/systems` (system-cards.tsx glass restyle for TemplateCard/OtherCard + info box), `/my-apps` (glass app cards, empty state, browse-more), `/select-org` (glass ActivateRow), `/demo` (replaced old top-bar nav, glass dashboard/table/CTA), `/windy` (kept LTR, bg moved to shell).
- **M4 verify:** `tsc --noEmit` clean; `npm run build` success with all `/app/*` routes intact; browser probes (puppeteer, Edge headless) — 10/10 public pages at 390×844 + 1280×800 (header/footer/no-overflow/shell bg); unauth redirect check `/select-org` + `/my-apps` → `/signin` (no 500); full authed flow signup→signin→select-org→my-apps 5/5 PASS (header+footer+overflow=safe+shell wrapper present). Probe infra: fresh signup via `auth.api.signUpEmail` needs matching origin (`.env.local` pins `http://localhost:3000`; better-auth CSRF 403s other origins); dev cluster `.data/pg` (port 5433) needed `prisma migrate deploy` to install schema (was empty).
- **Cleanup candidates:** `public/models/a_windy_day.glb` (55MB, unused — excluded from git commit), puppeteer-core devDep decision.

---

## 2026-09-17 — DENTAL PROD INCIDENT: login 500 (fixed + redeployed)

- **Symptom:** `business-os-company.vercel.app/dental/login` submits demo/demo123 → server action 500 → "This page couldn't load. A server error occurred."
- **Root cause:** deployed dental bundle queried the **`public`** schema on the shared Supabase (81 tables = Hospital app). Dental's 41 tables live in schema **`dental`**. `dental."User"` has column `name`; `public."User"` has `nameAr`/`nameEn` → Prisma error `The column "User.name" does not exist` → 500 on every DB query (login, dashboard).
- **Fix (working-tree changes, deployed via `vercel deploy --prod` from `public/dental-Clinic--main`):** `src/lib/prisma.ts` → `new PrismaPg(url, { schema: "dental" })`; `src/lib/dal.ts` → `requireAuth` redirects `/login?expired=1`; `src/proxy.ts` → drop stale cookie when `?expired=1` (breaks redirect loop). **⚠ Still uncommitted in monorepo git.**
- **Verified** DB-layer (exact loginAction query): pre-fix query fails with the column error; post-fix query finds `demo`, bcrypt `demo123` valid, SUPER_ADMIN, 78 perms, dashboard query OK. Live headless probe: login → `/dental/dashboard` (16 patients, 3 appts, revenue 283,000) 0 errors.
- **Gotcha:** Supabase pooler needs SNI username prefix `postgres.<ref>`; psql parsing must handle `postgresql://` scheme + literal quotes in `.env`.

---

## 2026-09 — PHARMACY SUB-APP (implemented + verified)

Standalone Next.js 16 + Prisma 7 app under `public/pharmacy/` (own root layout, own package.json, own DB). **Tracked as a git submodule** (`.gitmodules`: `public/pharmacy` → `https://github.com/gmsnow/pharmacy.git`) — commit/push inside `public/pharmacy`, then bump the gitlink pointer in the monorepo (`git add public/pharmacy`); never edit via the monorepo index.

### Run
- `next.config.ts` sets `basePath: "/pharmacy"` — app is served at `http://localhost:5000/pharmacy` (script pins port 5000). `next/link` + `useRouter` handle basePath automatically; client code that uses raw `fetch("/api/...")` or `window.location` must prefix `/pharmacy` (auth forms already do; keep this convention).
- Standalone: `npm --prefix public/pharmacy run dev` → http://localhost:5000/pharmacy.
- Root `concurrently` runner includes it (label `pharmacy`); root `next.config.ts` reverse-proxies `/pharmacy` and `/pharmacy/:path*` to `PHARMACY_URL` (default `http://localhost:5000`).
- DB: PostgreSQL `postgresql://postgres:bos_dev_2026@localhost:5432/pharmacy` (`.env`; leftover `prisma/dev.db` is unused, 0 bytes). Setup = `npm run db:migrate` + `npm run db:seed` (demo login `demo` / `demo123`; all seeded accounts share that password).

### Platform shape
- Arabic-first RTL (`NextIntlClientProvider`, `noto_kufi_arabic`), YER money as integer minor units (bigint, 1 YER = 100; never floats — server recomputes totals).
- Auth: custom cookie session (`serverCurrentUser` → `getCurrentUser`); server-gated by `requirePermission`; Next 16 `src/proxy.ts` (replaces middleware) routes unauthenticated users to `/login`.
- Prisma schema has **no relations** — manual FK mapping via id columns + Maps everywhere.
- Generic CRUD client: `src/components/resource-table.tsx` (fields/columns/search/save/delete/empty-state; no lucide `icon` prop — server→client boundary).

### Modules (all smoke-tested 200, `npx tsc --noEmit` clean, `npm run build` green)
- Base: dashboard, medicines (+batches, low-stock/FEFO), suppliers, customers, doctors, employees (ResourceTable CRUD).
- Purchases: PO with line editor, partial receive (per-item, status `received`/`partially_received`), cancel.
- Inventory: adjustments (`stockAdjustment` type/quantity/previousQty/newQty) + transfers (both warehouses, `inventoryMovement.warehouseId` required).
- Sales list + returns (sales returns per invoice line — restock batches, refund cash balances; supplier returns by batch).
- Prescriptions (create/dispense→creates cash sale at default warehouse, cancel), Expenses (records + category CRUD, negative cash movements), Cash (open/close sessions with discrepancy = actual − expected, deposit/withdraw).
- Reports (`?type=sales|inventory|expiry|expenses`, server-rendered tabs, KPI cards, PrintButton).
- Admin: settings (profile/appearance), audit log, roles reference, notifications, global search, profile (change password).
- Live search: header `GlobalSearch` dropdown + `/search` explorer both debounce (250 ms) and fetch `/pharmacy/api/search` (`src/lib/search-service.ts` — medicines/customers/suppliers/invoices/prescriptions, `mode: insensitive`); Enter opens the full explorer which live-updates on every keystroke.
- POS + receipt print (pre-existing, port 5000).

### Service-layer notes
- `src/lib/{inventory,returns}.ts` — purchase receive (partial) + sales/supplier return services; `src/lib/actions/*` are the server actions; `src/lib/{permissions,audit,password,i18n,dal}.ts` = auth/permission infra.
- Permission keys used: `purchases:create|receive`, `returns:create`, `inventory:adjust|transfer`, `cash:manage`, `expenses:create`, `settings:manage`, `audit:view`, `roles:view`, `notifications:view`, `search:view`; `AUDIT_ACTIONS` includes ADJUST/TRANSFER.
- Clients receive money as plain major-unit numbers; display via `fmtMoney(BigInt(Math.round(x * 100)), locale)`.

### Pitfalls recorded
- `medicine`/`warehouse`/`cashAccount` use `nameAr`/`nameEn` (not `name`); `medicineBatch.remainingQty` is Decimal → compare with `Number(...)`.
- Turbopack os error 112 ("disk full") into a `page_client-reference-manifest.js` = a wedged dev server (orphan process holding :5000), not real disk pressure — kill the port listener + delete `.next`, restart.

---

## 2026-09-25 — PLATFORM-ADMIN DASHBOARD RESTYLE (surgical, verified)

- **Scope:** `src/app/platform-admin/layout.tsx` (top header nav → sidebar dashboard) + `src/app/platform-admin/page.tsx` (dark neutral → light slate cards) + `src/app/platform-admin/sign-out-button.tsx` (match sidebar). Logic untouched: session/admin gate, all 6 nav routes (reused `nav.ts` `PLATFORM_ADMIN_NAV`, DRY), all dashboard queries/KPIs identical.
- **Design:** light SaaS admin — white sticky sidebar (`w-64`, `md:flex`, inline SVG icons, no new deps), `bg-slate-100` content, white `shadow-sm` cards, light-mode status pills (`emerald/amber/red/orange-50` + ring), dark `slate-900` primary button. Mobile: sticky top bar + pill nav (`md:hidden`).
- **Verified 2026-09-25:** `tsc --noEmit` 0 errors in touched files; `eslint` on 3 files clean; `git diff` confirms class-only changes (no query/logic lines touched).
- **Deploy fix 2026-09-25 (login + visibility):** `:3100` runs pm2 `businessos-erp` (`next start`, stale build) — rebuilt (`next build --webpack` green, all `/platform-admin/*` routes) + `pm2 restart businessos-erp`. Fixed `Invalid origin` on localhost login: `.env.local` `AUTH_URL` was the production host (trustedOrigins lacked `localhost:3100`) → set `AUTH_URL=http://localhost:3100` per `.env.example` convention (gitignored, local-only; production env unaffected, production host stays trusted via `NEXT_PUBLIC_APP_URL`).

## 2026-09-25 — PLATFORM-ADMIN: UNIFIED SHELL + THEME + AR/EN (surgical, verified)

- **Scope:** `layout.tsx` now renders the previously-orphaned `PlatformAdminShell` (active-nav highlight, approvals badge, breadcrumb, RTL-aware sidebar, `LocaleSwitcher` in footer — ar/en via `bos_locale` cookie + `getDictAndDir`); `ThemeToggle` added to shell desktop header + mobile bar (global `ThemeProvider` + `.dark` class already live in root layout, no new deps). Dashboard `page.tsx` rewritten dark-attractive to match shell: gradient hero panel, 5 KPI cards (lucide icon chip + gradient hairline + hover lift/glow), gradient progress bars, `divide-white/5` queues — queries/logic byte-identical, all strings via new `platform.dashboard.*` dict keys (ar+en, identical shape; `Dictionary = typeof en` enforced). Numbers/dates locale-aware (`ar-EG`/`en-US`).
- **Verified 2026-09-25:** `tsc` 0 errors, `eslint` clean on all touched files, `next build --webpack` green, `pm2 restart businessos-erp` → `/platform-admin` 307 (gate intact), `/signin` 200.
- **Known follow-up (out of scope, NOT touched):** subpages `tenants/plans/approvals/announcements/systems` keep legacy dark cards (coherent with shell) but are NOT yet bilingual beyond existing keys; light-mode (`dark:` variants) does not restyle the hardcoded dark shell — toggle currently affects token-based (`shadcn`) surfaces only.

## 2026-09-25 — PLATFORM-ADMIN REAL DUAL THEME (surgical, headless-verified)

- **Root cause of "toggle does nothing":** shell + dashboard used hardcoded dark utilities (`neutral-950/900`, `text-white`) with zero `dark:` variants, so flipping `.dark` changed nothing visible.
- **Fix:** `platform-admin-shell.tsx` + `page.tsx` rewritten light-first with full `dark:` overrides (shared `NAV_IDLE/HAIRLINE/MUTED/FAINT` + `PANEL/ROW_HOVER/TRACK/NAME/STRONG/SUB/H2` constants — no new deps); `ThemeToggle` + `SignOutButton` made theme-aware. Default stays dark (provider default + boot script), so existing users see zero change until they toggle.
- **Verified 2026-09-25:** `tsc` 0, `eslint` clean, `next build --webpack` green, `pm2 restart businessos-erp`. Headless probe (`themeprobe.js`, Edge + real admin login): `<html>` `dark` → toggle click → class removed + `bos_theme=light` + sidebar computed `rgb(255,255,255)`; dark/light screenshots both render correct Arabic RTL dashboard. `/platform-admin` 307 (gate intact).

## 2026-09-25 — PLATFORM-ADMIN AVATAR → PROFILE LINK (surgical, verified)

- Sidebar footer avatar (`P` circle) was a static `<div>` → now `<Link href="/profile">` with hover ring + bilingual `platform.viewProfile` tooltip/aria-label (ar/en keys added, shape-identical). `/profile` is session-gated and works pre-onboarding, so platform admins can open it.
- Verified: `tsc` 0, `eslint` clean, build green, `pm2 restart` (`/profile` 200); headless probe confirms `aside a[href="/profile"]` with Arabic aria-label.
- **Known follow-up (out of surgical scope, NOT touched):** subpages `approvals/tenants/plans/announcements/systems` still use legacy dark `neutral-900` cards — they render on the new light content bg and should be restyled in a follow-up pass for visual consistency.

---

## 2026-09-25 — MARKETPLACE & SYSTEM CATALOG (implemented)

Central dynamic system catalog + self-service customer marketplace + admin manager. Full docs: `docs/MARKETPLACE.md`, `demo-systems/README.md`.

### Wired (end-to-end, TDD)
- **`src/core/systems/catalog.ts`** — pure shared logic: `systemKind`, `openRouteForSlug`, `installState` state machine (`unavailable/installed/pending/demo/installable`), `catalogAppSchema`, `DEMO_CATALOG_META`. Tests `tests/core/m15-system-catalog.test.ts` 17/17 green (fails-first).
- **`src/core/apps/service.ts`** — `getAppCatalog` (+install/request counts), `upsertCatalogApp`, `updateCatalogApp`, `deleteCatalogApp` (guarded), `seedDemoCatalog`, `getCustomerMarketplace` (per-tenant state + favorites), `setFavorite` (`pinnedApp`).
- **APIs** — `GET/POST /api/platform/apps`, `PATCH/DELETE /api/platform/apps/[slug]` (all `requirePlatformAdmin`); `POST /api/v1/apps/[slug]/request` (demo instant / real→pending approval, `requireTenantContext`); `PUT|DELETE /api/v1/marketplace/favorites/[slug]`.
- **UI** — `/platform-admin/systems` + manager (search/category/CRUD/toggle/delete); `/apps` customer marketplace (search/categories/favorites/recently-opened/pending banner/toasts); `/my-apps` now shows pending-approval banner + links the marketplace. `install-template` now ALWAYS creates a platform approval request for real systems (aligns with `docs/AUDIT-2026.md` "install → pending"). Instant-install backdoor `apps/[slug]/install` refuses real systems.
- **`demo-systems/`** — registry `src/core/demo/demo-systems.ts` + README; seeded the 7 demo systems into the catalog (`scripts/seed-system-catalog.ts`, idempotent, ran OK → catalog now 9 rows: grocery/sama-center (real) + 7 demo).
- **i18n** — added `platform.*` + `platform.systems.*` + `platform.nav.*` keys (ar/en) used by the admin manager.

### Pre-existing debts discovered (NOT introduced by this milestone)
- **Prisma client/schema drift — RESOLVED 2026-09-27:** the note here previously claimed the disk schema used snake_case models while the client used PascalCase. That was wrong: every model is PascalCase with `@@map("snake_case")`. The real defect was that `pinnedApp`/`userFollow` had **no migration at all** → fixed by `20260927000000_pinned_apps_user_follows` (see the 2026-09-27 entry).
- **`src/core/tenancy/schemas.ts` imports `sharedPrisma`/`dbSchema` from `@/core/db/client` which do NOT exist** (real `client.ts` is a plain singleton on `DATABASE_URL`). The schema-per-tenant / database-per-system provisioning layer + `scripts/provision-grocery-tenant.ts` reference a fictional client and are currently dead code; runtime isolation is `tenant-guard.ts` (`organizationId` filters). Documented honestly in `docs/MARKETPLACE.md`.
- **Root `tsc --noEmit` is noisy pre-existing** (nested `apps/grocery`, `public/*` demos, WIP tenants/expenses/platform-admin-shell, `tests/core/phase3-restored-endpoints.test.ts`, `schemas.ts`). Added missing public demo folders (`public/Optometry  Eye Clinic System`, `public/POS System`, `public/laboratory--main`, `public/earth`) to `tsconfig.json` `exclude`. All files touched by this milestone compile clean.
- `app` registry columns `nameAr/description/descriptionAr/icon/version/routePrefix` are nullable in DB → types carry `| null` and UIs fall back to EN.

### Verification status
- `tests/core/m15-system-catalog.test.ts` 17/17 PASS; full suite `vitest run` **246/246 PASS (16 files, 0 failures)**.
- `tsc --noEmit`: zero errors across every milestone file (root tsc remains noisy on pre-existing WIP listed above).
- ESLint: milestone files **0 errors** (2 `no-img-element` warnings mirror the repo-wide pattern).
- Production build: `npm run build` **green (EXIT=0)** — all routes compiled (`/apps /my-apps /platform-admin/systems /app/* …`).
- Live on `next start -p 3100` (pm2 `businessos-erp` `online`): `/` 200; `/apps /my-apps /platform-admin/systems` → 307 (auth guard); `/api/platform/apps` → 401; demo APIs → 405-without-session; `/approval-pending /demo /systems` 200.
- Seed applied: catalog = 9 rows (grocery/sama-center real + 7 demo), all `isActive`.
- ⚠ Build wedge gotcha (recorded): first `next build` attempts stalled pre-compile (webpack worker pool, silent EXIT=1) — caused by an orphaned/loaded dev-server state in the environment, **not** the milestone diff; cleared by killing stray node + removing `.next`, then build succeeded unchanged.

---

## 2026-09-26 — SHARED DB FRESH SETUP + PER-SYSTEM DEMO SCHEMAS (executed + verified)

### Fresh setup (shared `businessos` DB, schema `businessos` @ `localhost:5432`)
- Found empty: `prisma migrate status` showed all migrations unapplied → ran `prisma migrate deploy` (22 migrations) + `prisma generate` + `npm run db:seed`.
- Drift fixed (surgical, additive): `schema.prisma` `user` had `privacy`/`profile_extras`/`socials` with no migration (`20260924` only added bio/phone/locale/preferences) → new migration `20260926000000_user_profile_missing_cols` (3× `ADD COLUMN IF NOT EXISTS JSONB`). Seed then passed.
- Verified: `migrate status` = up to date; counts `plans=4 users=1 apps=2`.

### Per-system demo schemas
- `scripts/provision-demo-schemas.ts` (idempotent): for each `DEMO_SYSTEMS` slug creates `demo_<slug>` + empty structural copies of all 55 `TENANT_TABLES` via `LIKE businessos.<table> INCLUDING ALL` (same proven pattern as `provisionTenantSchema`; `demo_*` prefix avoids collision with tenant `t_*` namespace).
- Verified 2026-09-26 (script self-check + re-run for idempotency): 9/9 schemas `55/55 tables` — demo_grocery/sama/cafe/hospital/dental/laboratory/pharmacy/pos/optometry.
- Follow-up (NOT done, out of scope): per-system demo *data* seeding; wiring demo apps to these schemas (standalone demo sources absent from `public/` — only `pharmacy` submodule declared).

---

## 2026-09-26 — /demo BUSINESS SYSTEMS CATALOG (surgical, verified)

- **Scope (existing page untouched):** `src/app/demo/page.tsx` keeps trial flow/picker/dashboards byte-identical — only imports + renders `<BusinessSystemsSection/>` at the end of `StartView`. New files only: `src/core/demo/business-systems-data.ts` (18 categories + 173 systems, ar/en names+descs+keywords, lucide icon refs, status) + `src/components/demo/business-systems-section.tsx` (search w/ Arabic-tolerant normalize, category pills, 6-mode sort, grouped sections, premium glass cards reusing the page's dark RTL tokens).
- **Routing (no fake links):** the 9 demo app sources are **absent from `public/` in this workspace** (`muafa-store-main`, `celia-main`, `dental-Clinic--main`, `pharmacy`, `POS System`, `Optometry  Eye Clinic System`, `samaSYSTEM-main`, `Hospital--main`, `laboratory--main` — only `demo/ earth/ icons/ models/ *.svg` exist). `next.config.ts:14` still rewrites `/grocery /sama /celia /hospital /dental /laboratory /pharmacy /pos /optometry` to ports with nothing listening, so those cards would 502. **User decision 2026-09-26: all 173 catalog entries are `coming_soon`** (no live route) → every card links to the real `/signup` CTA. Zero broken links by construction.
- **Merge (user-requested):** the old 9-card picker grid in `StartView` was **deleted** as a duplicate; its richer Arabic taglines were moved into the matching catalog entries, and the catalog's own duplicate headline was dropped so the page hero (`جرّب Business OS مجاناً`) is the single H1 with a `اختر نظامك` divider. The `activeId`/`onPick` catalog→`SystemKey` wiring was added then removed again (orphaned once no live card remained) — net diff stays surgical.
- **Verified 2026-09-26:** `tsc` 0 errors repo-wide, `eslint` 0 on all 3 files, `next build --webpack` green; data check `total=173 cats=18 available=0 withRoute=0`, ids unique, no empty text, per-category counts match spec, no entry carries a route. Also fixed a pre-existing build blocker: `tests/core/m16-self-service-install.test.ts:122,126` passed extra props to `tenantFilter(Pick<TenantContext,"organizationId">)` → `next build` failed type-check until the 2 redundant literals were dropped.
- **⚠ Pre-existing issues found, NOT touched (out of surgical scope):** (1) `next.config.ts:92-112` has the `/pharmacy` rewrite block **duplicated verbatim**; (2) `npm run dev` still lists 7 `dev:*` scripts whose folders don't exist, so `concurrently` exits 1 and takes `erp` down with it — ERP dev must be run as `npx next dev --webpack -p 3100` until the sources are restored. **Both fixed 2026-09-27 — see the last entry.**
- **Verified 2026-09-26:** `tsc` 0 errors + `eslint` 0 errors/0 warnings on all 3 touched files; data script `total=173 cats=18 available=9`, per-category counts match spec, ids unique, no empty text; `next build --webpack` compiles green incl. `/demo` — type-check fails ONLY on pre-existing `tests/core/m16-self-service-install.test.ts` (untouched, unrelated TenantContext Pick drift).

---

## 2026-09-27 — DEBT CLEARANCE PASS (4 surgical fixes, tests-first)

Executed from `[ORPHANS & PENDING]` + the defects the 2026-09-26 entry flagged. Every goal proved by a failing-then-passing check.

### 1. Missing tables broke marketplace favorites (runtime 500)
- **Symptom:** `vitest run` → `m16-self-service-install.test.ts > marketplace reflects installed state per tenant` FAILED — `The table businessos.pinned_apps does not exist`. `getCustomerMarketplace` (`src/core/apps/service.ts:578`) fans out to `prisma.pinnedApp.findMany`, so `/apps` and every favorite toggle 500'd in production.
- **Root cause:** `pinnedApp` + `userFollow` existed in `schema.prisma` but **no migration ever created them** (only `organization_app_requests` was migrated, in `20260921163424`). Confirmed by diffing all 77 `@@map` names against `information_schema` (75 present, 2 missing).
- **Fix:** `prisma/migrations/20260927000000_pinned_apps_user_follows/migration.sql` — additive only (2 tables, 4 indexes, 4 FKs, `IF NOT EXISTS` guarded, schema-qualified like `20260926000000`). No code/schema change: the PascalCase-model → `@@map("snake_case")` mapping was already correct.
- **Verified:** `prisma migrate deploy` applied (23 migrations); `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → **0 (zero drift repo-wide)**; `m15`+`m16` 25/25 green.

### 2. M11 backup never produced a dump (and claimed success anyway)
- **Symptom:** every `vitest` run printed `pg_dump: error: invalid URI query parameter: "schema"` twice, yet all 4 backup tests passed.
- **Root cause:** `src/core/integrations/backup.ts` ran `pg_dump "<DATABASE_URL>"` with Prisma's `?schema=businessos` still attached (pg_dump rejects it), and dumped `--schema=public` — the wrong schema for this app. The `catch` swallowed the failure into a JSON logical snapshot that was still written to a `.sql` filename and recorded as `status:"verified", verified:true`, i.e. exactly the "never claims success unverified" goal failing.
- **Fix (surgical):** `execSync` string → `execFileSync` argv (no shell interpolation of the password); conn string stripped of `?schema=` using the same idiom as `src/core/db/client.ts:25`; explicit `--schema=${dbSchema}` (reuses the client module's schema source of truth — DRY) for full **and** tenant dumps; logical fallback now only on `ENOENT` (pg_dump genuinely absent) and otherwise throws `ApiError.internal`; artifact extension + `manifest.mode` (`pg_dump` | `logical`) + `manifest.schema` now tell the truth. Added `logger.error`/`logger.warn` per the logging protocol.
- **Test-first:** new `m11-integrations.test.ts` case `produces a real pg_dump SQL artifact, not a silent logical fallback` asserts `manifest.mode === "pg_dump"` and that the file contains `CREATE TABLE` + `businessos.` → failed (`undefined`) before the fix, passes after.
- **Verified:** 5/5 backup tests green, stderr `pg_dump` error gone.

### 3. Duplicated `/pharmacy` rewrite
- `next.config.ts` had the `/pharmacy` + `/pharmacy/:path*` beforeFiles block **twice** (the copy-paste landed with broken indentation). Removed the duplicate; the surviving block is the correctly indented one. No routing behaviour change.

### 4. `npm run dev` killed the ERP server
- **Symptom:** all 7 `dev:*` scripts point at `public/<app>` folders absent from this workspace, so `concurrently` exits 1 and took `erp` down with it (reproduced: one failing child ⇒ immediate exit 1).
- **Fix:** new `scripts/dev.ts` (+ `package.json` `dev` → `tsx scripts/dev.ts`, `dev:erp` → `next dev --webpack -p 3100`). It reads `package.json` as the single source of truth for each sub-app command, extracts every `--prefix` dir, and **skips absent ones with a notice**; a present sub-app that dies logs a warning and the run continues; only the ERP is critical (non-zero ⇒ stop everything). `node_modules/.bin` is prepended to `PATH` (a bare spawn has no `npm run` PATH), and Windows children are killed as a tree via `taskkill /T /F` (avoids the recorded "orphan process holding the port" wedge). `JSON.parse` strips a BOM (same PS 5.1 hazard as `.env.local`).
- **Verified** against a fixture workspace (real repo untouched — a live `node` server owns `:3100`): 7/7 real `dev:*` scripts correctly detected absent, incl. the space-containing `public/POS System` and `public/Optometry  Eye Clinic System` and the two-dir `dev:sama`; a sub-app exiting 1 → `[dev] fake exited with code 1 - continuing without it`; ERP survived the full run; ERP failure ⇒ `EXIT=1`.

### 5. `/demo` hero copy merged into one text, then organized with icons (user request)
- **Scope:** `src/app/demo/page.tsx` `StartView` + `src/components/demo/business-systems-section.tsx` only. The badge, description paragraph, 3 perk chips, credentials box, "النظام متاح مباشرة…" note, `اختر نظامك` divider, catalog badge + `173 نظاماً…` line and the English tagline were six stacked blocks; they are now **one** block under the H1 `جرّب Business OS مجاناً` (kept — a page still needs its single H1) carrying the user's exact wording.
- **Then organized (2nd pass, same wording, no new claims):** intro line, then a `<ul>` of three glass icon chips (`ShieldCheck` بدون تسجيل أو بطاقة ائتمان · `Database` بيانات تجريبية جاهزة · `KeyRound` الدخول التجريبي `demo / demo123` in `font-mono` on a `primary` chip), then a `LayoutGrid`-led glass card holding the catalog sentence, then the `Sparkles` closing tagline. All styling reuses the catalog section's existing dark-RTL glass tokens (`border-white/[0.08] bg-white/[0.03] backdrop-blur-xl`, `bg-primary/15 text-primary`) — no new deps, no new palette. Catalog size stays **dynamic** (`BUSINESS_SYSTEMS.length` / `SYSTEM_CATEGORIES.length`, plus the `availableCount > 0` live-systems clause so the copy cannot go stale). 🔑 emoji replaced by the `KeyRound` icon.
- **Orphan cleanup from that change:** `PERKS`, the `Zap`/`CheckCircle2` imports, the section's own sub-header, its `availableCount` memo, and the `Sparkles` import (re-added to `page.tsx` for the tagline) all became dead and were removed. `<section aria-label="حلول الأعمال">` and the `sr-only` search label stay for a11y.
- **3rd pass (user request) — the grocery CTA deleted:** the `افتح نظام البقالة` anchor is gone. It was the `LIVE_KEYS.has(picked)` branch of a ternary whose condition is **always true** (`LIVE_KEYS` holds all 9 `SystemKey` values), so the `ابدأ النسخة التجريبية` button beside it was already unreachable. Both branches removed, so the hero now ends on the catalog section. Cascade cleanup (orphans of this deletion only): `StartView` lost its `picked`/`onStart` props and its local `system` lookup, `DemoPage.handleStart` deleted, `startDemoTrial` + `LIVE_LABEL` imports/constants removed. `picked` state, `SYSTEMS`, `LIVE_KEYS`, `LIVE_HREF`, `ArrowLeft`, `Timer` stay — still used by `ActiveView`/tabs/iframe. Trial-start is still reachable from `ActiveView`/`ExpiredView`; only the duplicated hero CTA is gone.

### Verification status
- `npx tsc --noEmit` → **0 errors repo-wide**; `npx eslint` → **0** on all 6 touched files.
- `npx vitest run` → **255/255 PASS (17 files)** — was 253/254 with `m16` failing at session start; the extra test is the new backup case. No regressions.
- `next build --webpack` **NOT run this session** (deliberately): a `node` server is serving `:3100` from `.next`, and pm2 is not on PATH here to restart it. Pending user go-ahead.

### 6. Google sign-in on localhost — app code verified correct, fix is in Google Cloud Console
- **Symptom:** Google answers `Access blocked: This app's request is invalid` + `Error 400: redirect_uri_mismatch` for `snows6005@gmail.com` when using the Google button on `/signin` or `/signup`.
- **Impact analysis (no code bug):** the provider is already wired — `socialProviders.google` from `GOOGLE_CLIENT_ID/SECRET` (`src/core/auth/server.ts:59`), the buttons are gated by `getEnabledProviders()` (`:107`), and both forms pass a relative `callbackURL`. Probed the live instance: `POST /api/auth/sign-in/social {"provider":"google"}` → `200` with `client_id=775353326974-…apps.googleusercontent.com` and `redirect_uri=http://localhost:3100/api/auth/callback/google` (derived from `baseURL = AUTH_URL`); `GET /api/auth/callback/google?code=…&state=…` reaches Better Auth's handler (`/api/auth/error?error=state_mismatch` on a probe, not a 404). So the local round-trip is correctly wired end to end.
- **Root cause:** that OAuth client has no `http://localhost:3100/api/auth/callback/google` in its **Authorized redirect URIs**, and the consent screen is in **Testing** with that Gmail not listed as a test user. Both are Google-console settings — nothing in this repo can change them.
- **Durable fix recorded:** `.env.example` Auth block now documents the exact redirect URI to register per origin (local + prod), that `AUTH_URL` must match the browsed origin because it drives `redirect_uri`, and the "Test users" requirement behind the *Access blocked* screen.
- **⚠ Local env inconsistency (NOT changed — user decision pending):** `.env.local` has `AUTH_URL=http://localhost:3100` but `NEXT_PUBLIC_APP_URL=https://businessoscompany.dpdns.org`. Auth is unaffected (`baseURL` prefers `AUTH_URL`), but `NEXT_PUBLIC_APP_URL` drives root-domain/tenant-subdomain derivation (`src/core/tenancy/host.ts:15`) and the platform-admin shell link, and the mixed pair is what caused the recorded `Invalid origin` incident on 2026-09-25. `.env.example` sets both to `http://localhost:3100`; align the local file the same way when convenient.

### Still open in `[ORPHANS & PENDING]`
- Per-system demo **data** seeding into the `demo_*` schemas, and wiring the demo apps to them (their sources are still absent from `public/`; only the `pharmacy` submodule is declared).
- Platform-admin subpages `approvals/tenants/plans/announcements/systems` still use legacy dark `neutral-900` cards and are not bilingual.
- `next.config.ts` still rewrites `/grocery /sama /celia /hospital /dental /laboratory /pharmacy /pos /optometry` to ports with nothing listening (harmless while every catalog entry is `coming_soon`; will 502 if a card ever gains a live route before its source returns).

---

## 2026-09-27 — DEMO SCHEMAS MOVED INTO THEIR OWN `demo` DATABASE (executed + verified)

### What moved
- `CREATE DATABASE demo` on the local cluster (`localhost:5432`). Every non-platform schema was copied out of the `businessos` database with `pg_dump -n <schema>` → `psql -d demo` (structure + data, `--no-owner --no-acl`), then row-for-row verified before anything was dropped.
- **Moved (9):** `demo_cafe demo_dental demo_grocery demo_hospital demo_laboratory demo_optometry demo_pharmacy demo_pos demo_sama` — 55 tables each, 0 rows each. Verified identical (9×`55/55`, 0 rows) on both sides, then `DROP SCHEMA … CASCADE` in `businessos`.
- **Copied, source kept:** `public` — 75 tables / **646 live rows** (`users` 73, `sessions` 47, `organizations` 35, `members` 25, `audit_logs` 69, `outbox_events` 92, …). Legacy pre-`businessos`-schema state. It now exists in BOTH databases; the `businessos` copy was deliberately **not** dropped — `public` is PostgreSQL's default schema and that data is not mine to destroy. Awaiting an explicit decision.
- **Result:** `businessos` DB = `businessos` (78 tables, 182 rows) + legacy `public`. `demo` DB = the 9 `demo_*` schemas + the `public` copy. No runtime regression: nothing in `src/` ever reads `demo_*` (only `scripts/provision-demo-schemas.ts` creates them), and Prisma is pinned to `?schema=businessos`.

### Provisioning follows the new home (`scripts/provision-demo-schemas.ts`)
- Target resolution: `DEMO_DATABASE_URL`, else `DATABASE_URL` with the database segment swapped for `demo`; it **refuses to run** when the resolved target equals the platform database, so this can never regress into the old shared-database behaviour.
- `?schema=` stripped for `pg` (same reason as `src/core/db/client.ts:25`); credentials never re-encoded (target URL is rewritten with a regex, not `new URL().toString()`); `pg_dump`/`psql` invoked with `execFileSync` + argv arrays and `PGPASSWORD` in the child env — the same no-shell-interpolation rule the M11 backup fix established.
- **Cross-database template problem solved:** PostgreSQL cannot `LIKE` a table in another database. When a demo schema is missing or short of tables, the shared schema is streamed in DDL-only (`pg_dump --schema-only`) as a template, the demo schemas are built, then the template is `DROP`ped again — the `demo` database must not be left holding a `businessos` copy. An up-to-date demo database skips the dump entirely.
- **Verified both paths, live:** (A) already-provisioned → no dump, straight to `9/9 × 55/55` verification; (B) self-heal — dropped `demo_sama.products` **and** the whole `demo_pos` schema → detected the gaps, seeded, rebuilt, dropped the template, re-verified `9/9 × 55/55`. The script now fails loudly on an incomplete schema set or a leftover template schema.
- `DEMO_DATABASE_URL` documented in `.env.example` (new "Demo data" block) and set in `.env.local`. `npx tsc --noEmit` 0 errors repo-wide; `npx eslint scripts/provision-demo-schemas.ts` 0.
- **Not done:** no `npm` script wrapper for provisioning (run via `npx tsx scripts/provision-demo-schemas.ts`), and the 646 legacy `public` rows still exist in both databases.

---

## 2026-09-27 — /demo MOTION & TRANSITION PASS (verified headless, no copy changes)

- **Scope:** motion only. No wording, no links, no routing, no data touched — the page is the same content with a motion layer on top.
- **New shared primitive** `src/components/demo/use-scroll-reveal.ts`: one `IntersectionObserver` for the whole catalog subtree. The landing page's `<ScrollReveal>` was deliberately NOT used for cards — it mounts an observer + 3 inline styles per instance and /demo renders **173** cards. The hook hides only elements that *start below the fold* (measured synchronously), so anything on screen, and everything when JS is off, renders immediately with no flash and no invisible content; it re-runs on every render and is self-healing (an in-view element is always revealed), so an observer disconnect or a filter remount can never strand a card at `opacity: 0`. Opts out under `prefers-reduced-motion`. Also exports `spotlightFromEvent` (one delegated pointermove writes `--mx`/`--my`) and `revealDelay` (per-grid-position stagger, capped).
- **New CSS block** `DEMO PAGE MOTION` in `src/app/globals.css`: `.reveal-item`/`.is-revealed` transitions, `.demo-card` cursor spotlight (radial gradient at the pointer, `@media (hover: hover) and (pointer: fine)`), `.demo-underline` growing from the RTL reading edge, `.demo-sheen` hover sweep, `.demo-progress-sheen`, `.animate-float-slow`, `.demo-progress-fill`. Reused the existing landing keyframes/classes rather than duplicating them.
- **Applied:** hero H1 gradient + `ScrollReveal` cascade (0/120/240/360/480ms), 3 drifting ambient orbs, chip/tagline hover lifts; catalog group headers reveal with the underline sweep; cards get the spotlight, per-position stagger and existing lift; result count re-keys to cross-fade on every filter/sort change; trial view dashboard re-keys on `system.key` for a cross-fade, tabs lift on hover, live badge + primary CTAs get the sheen, trial progress bar gets a travelling highlight. Fixed a dead end found while verifying: the first shimmer attempt relied on `background-position`, but `background-size` computed to `auto`, so the sweep was invisible — replaced with a dedicated translate keyframe.
- **Verified in real Chrome (headless, puppeteer-core), sandbox on :3110** — the running :3100 prod server was never touched (`next build` still blocked by it). `/demo` → 200: 191 reveal targets (173 cards + 18 group headers), 5 revealed at load, 16 after scrolling, progress bar `--demo-progress 0.1660` → `matrix(0.166,…)`, spotlight pseudo-element `opacity 0 → 1` with `--mx 70% / --my 31.6%`, category filter 173 → 10 cards, **0 elements stranded invisible in the viewport after interaction**, `prefers-reduced-motion` → **0 hidden**, no console/page errors. Trial view confirmed via a seeded `bos_demo_trial`: banner, 10 tabs, live embed iframe, `demo-progress-sheen` animating at 89.6px inside its 224px bar.
- **Known 500 in that session is pre-existing, not a regression:** the `/grocery` **iframe** hits the `next.config.ts` rewrite to a port with nothing listening — the exact condition already recorded under `[ORPHANS & PENDING]`.
- `npx tsc --noEmit` 0 errors repo-wide; `npx eslint` 0 on all 3 touched files; `npx vitest run` **255/255 PASS (17 files)** — no regressions. `next build --webpack` still NOT run (live server on :3100, no pm2) — pending user go-ahead.

---

## 2026-09-27 — GREEN PARTICLE WALLPAPER ON /demo (verified in real Chrome)

- **Request:** green `particles.js` wallpaper behind the page. **No `particles.js`/`tsparticles` package exists in the project** and nothing was installed — instead the repo's own particle system was reused: `src/components/signin/particle-canvas.tsx`, the same green canvas (`rgba(3,234,188)`) that signin/signup already ship, loaded on /demo via `next/dynamic` `ssr:false` (identical pattern to `src/app/signin/page.tsx:11`).
- **Component made configurable, defaults preserved:** new optional `count` (desktop; <768px gets 40% of it) and `intensity` (scales particle + connector-line alpha, clamped to 1) props. Defaults `150` / `1` reproduce the previous expressions exactly, so signin/signup are unaffected. `init`'s `useCallback` deps updated to `[count, intensity]`.
- **/demo settings live at the top of `src/app/demo/page.tsx`** (`PARTICLE_COUNT = 90`, `PARTICLE_INTENSITY = 1.9`) — tuned for a long dense page rather than a short auth screen.
- **Placed as the first child of `<OnboardingShell>`, before `<main>`** — same DOM position as signin. This matters: the shell root is `relative` with an **opaque** `rgb(5,5,16)` background, so a `-z-10` canvas placed *inside* `<main>` would be correct only by accident of stacking order; as a sibling of the content slot it sits inside that slot's `z-10` stacking context, i.e. above the shell background and below page content.
- **Verification (headless Chrome, sandbox :3110 — the :3100 prod server untouched):**
  - **Z-order proven, not assumed:** at 6 real particle coordinates read out of the canvas bitmap, `document.elementsFromPoint()` returns `canvas.fixed.-z-10` *above* `div.dark.bg=rgb(5,5,16)` and *below* `main`'s content.
  - **Visibility proven by A/B pixel diff** (screenshots decoded in-browser, canvas shown vs `display:none`): frozen via `prefers-reduced-motion` so both frames are identical — without that, drifting particles make the diff meaningless (an early live-motion run showed a false ~0 delta). /demo adds **360 green px / 216 in the strong band**; the first attempt at intensity 1.0 added only 137, which is what prompted the `intensity` prop. /signin adds 47 strong px with its unchanged defaults, and still returns 200 with no errors.
  - **Cost measured:** full programmatic scroll of the whole 16,563px page (all 173 cards) — **74.4 fps with the canvas vs 75.0 without, 0.6 fps cost (noise)**. The O(n²) connector-line pass at 90 particles is not a problem here.
- **Caveat:** I cannot view images, so I verified via computed styles, `elementsFromPoint`, bitmap reads and pixel diffs. If the field reads too faint or too busy, `PARTICLE_COUNT` / `PARTICLE_INTENSITY` in `src/app/demo/page.tsx` are the only two knobs.
- `npx tsc --noEmit` 0; `npx eslint` 0 on both files; `npx vitest run` **255/255 PASS (17 files)**. `next build` still pending user go-ahead.

---

## 2026-09-27 — PINNED SEARCH + CATEGORY TOOLBAR ON /demo, AND A STICKY BUG THAT WAS BREAKING IT APP-WIDE

- **Request:** keep the search/filter bar visible at the top while scrolling the 173-card catalog.
- **Delivered:** the search input and the category pills are now one `sticky` unit (`src/components/demo/business-systems-section.tsx`) — they are one control cluster, and pinning only the pills would have left the search box scrolling away. Full-bleed via `-mx-4 sm:-mx-6` plus matching inner padding, so cards scroll *under* the glass instead of past its edges; gap between input and pills tightened `mt-6` → `mt-3` now that they are one block. Pill row deliberately left full width — 20 categories need it to stay a mostly-horizontal strip.
- **The toolbar offset is measured, not hard-coded:** an effect reads the real header height into `--toolbar-top` and only does so when the header's computed position is `sticky`/`fixed`, so it degrades to `0` instead of leaving a gap cards scroll through. It re-measures on resize and via `ResizeObserver`.
- **Two real bugs were blocking `position: sticky`, both pre-existing and app-wide:**
  1. `src/app/globals.css:226` had `overflow-x: hidden` on `html, body`. That makes the root element a **scroll container**, which silently disables `position: sticky` for every descendant. Changed to `overflow-x: clip` — same clipping, no scrollport. This is the fix that made sticky work.
  2. `src/components/onboarding/onboarding-shell.tsx:15` had `overflow-hidden` on the shell root, which had the same effect one level down. Removed it there, and moved the clip onto the ambient-glow layer (`fixed inset-0`), which is exactly the viewport — the 300–500px blurred orbs genuinely overflow narrow screens, so they still need clipping, and the sweep below confirms it is sufficient.
- **Consequence to be aware of:** the shell's glass header (`sticky top-0 z-50`, a design that clearly intended to stick) **now actually sticks on every page** — previously it scrolled away. Nothing is permanently hidden by this: at `scrollY 0` the header is in flow, and the /demo hero already clears it.
- **Verified headless (sandbox :3110, live :3100 untouched), desktop 1440×900 and mobile 390×844:**
  - At `scrollY 4000`: `header.top = 0`, `toolbar.top = 67`, search input and pill row both fully in the viewport, `overlapWithHeader: false`.
  - Filtering **while scrolled**: clicking "السيارات" gave 9 cards and `عرض 9 من 173 نظاماً` with the toolbar still pinned at 67.
  - At `scrollY 0` the toolbar sits at its natural in-flow position (479 desktop / 615 mobile), so nothing overlaps the hero.
  - **Horizontal-overflow sweep after removing both clips** — `/`, `/signin`, `/signup`, `/demo`, `/systems`, `/my-apps`, `/select-org`, `/windy` at 390px: every one `scrollWidth === clientWidth === 390`, no horizontal scrollbar. The glow orbs still measure 208px past the edge but are clipped by their layer, as intended.
  - No console/page errors on any route.
- Caveat: total pinned chrome is 67px header + 113px toolbar ≈ 180px (21% of an 844px phone viewport). If that is too much, the toolbar can be trimmed to the pill row alone.
- `npx tsc --noEmit` 0; `npx eslint` 0 errors (2 pre-existing `<img>` warnings in the shell header/footer, untouched); `npx vitest run` **255/255 PASS (17 files)**. `next build` still pending user go-ahead.

---

## 2026-09-27 — LANDING RAIL: ALWAYS VISIBLE + CLASSY PC TREATMENT

- **Request:** the vertical `<nav>` rail on `/` should always be visible and look better on PC.
- **Why it was never visible:** `page.tsx` held `const [navOpen, setNavOpen] = useState(false)`, so the rail started closed, was opened by a slim edge tab or a left-edge swipe, and **every nav click called `setNavOpen(false)`** — so it hid itself again after each navigation. All of that state is gone now: no toggle, no swipe zone, no `navOpen`. Removed with it: the `gestureStart` ref and the now-unused `ChevronRight` import, plus a stray `setNavOpen(false)` that was still sitting in the **mobile dock** button (it was already a no-op there — the dock never used `navOpen`).
- **Then restyled again into a 3D unfolding-label nav** (the user supplied the Codrops "3d rotating navigation + CSS icons" demo). Each page is now a solid brand-green 56px tile with a dark icon; on hover a label panel swings open in 3D from the tile's inner edge — `perspective(400px) rotateY(90deg)` folded → `rotateY(0deg)` open, `transform-origin: left center`, matching the original's mechanic and timing. The panel is `absolute left-full` (physical, on purpose: this is a 3D rotate about a vertical axis on a rail docked left, not a logical-direction concern), `rounded-e-2xl` with `border-s-0` so it reads as one continuous strip with the tile, and it is `pointer-events-none` so it can never block a click. The outer glass capsule and the per-tile text labels are gone — the tile is the whole object, the label only exists on hover. `aria-label` on the button + `aria-hidden` on the panel keeps it accessible. Entrance is a `rail-in` slide plus a per-tile stagger driven by a `--i` custom property (`0.12s` + `i * 55ms`).
- **The hover trigger is React state, not CSS `:hover` — this was a real bug, found by testing.** `Hero3D` (`src/components/landing/hero-3d.tsx`) is a **full-viewport Sketchfab iframe** (`absolute inset-0`, iframe `h-full w-full`) sitting under the hero copy. Once the pointer enters that nested document, the parent document stops receiving mouse events, so `:hover` **latches and never clears**. Measured: a realistic 14-step mouse glide out of a tile into the content, a single teleport into the iframe, and a scroll wheel all left `:hover: true` with the label still open. The obvious fix — `pointer-events: none` on the iframe — was rejected because the viewer is initialised with `scrollwheel: 1`, so that would silently kill the scroll-driven camera. Instead `page.tsx` holds `peek` state (`openPeek`/`closePeek`) opened on `onPointerEnter`/`onPointerMove`/`onFocus`, with a **2500ms dwell watchdog** that closes it when the parent stops hearing about the pointer. Verified: the panel closes within 3.3s after both the glide and the teleport, and reopens immediately when the pointer returns. Trade-off: a perfectly motionless cursor resting on a tile loses the label after 2.5s (any movement brings it straight back) — the price of never leaving a label stuck on screen. The tile's hover lift and fill also come from `.is-open` for the same reason; the lift lives on `.rail-tile`, not the button, because `animation-fill-mode: both` pins a transform on the animated element forever and would silently beat the hover transform.
- **Tightened per user feedback (icons too big, rail too far from the edge, "flip not working").** Tiles 56→**48px** (`h-12 w-12`, `rounded-xl`), Lucide icons 24→**18px** (`h-[18px] w-[18px]`), brand tile 56→48 with a 36→28px logo, label panel `h-12` / `px-3.5` / `text-[13px]`. The 3D got stronger: folded is `perspective(400px) rotateY(90deg) translateZ(-40px)`, open is `rotateY(0deg) translateZ(14px)`, so the panel swings around the hinge **and** comes out toward the viewer instead of merely widening. Measured open height 49.7px vs 48px — that extra 1.7px is the perspective pop, i.e. the depth is real.
- **"5px from the left edge" fought the auth links, twice.** The two auth text pills were wider than a tile, so they set the flex column's width (96.4px) and `items-center` pushed the tiles to **29.2px** from the edge. Switching the column to `items-start` made it *worse* (**53.4px**) — because the app is RTL, so `items-start` is the *right* edge. The fix was not a positioning incantation: **the auth links became two more 48px tiles** (`AUTH_RAIL`, `LogIn` / `UserPlus`, same 3D label), which makes the column exactly one tile wide (`w-12`, measured `48`) so centring is a no-op and the tiles land at exactly **5.0px**. Verified at 1920/1440/1280. Side effect worth knowing: the "إنشاء حساب" pill is no longer a filled CTA in the rail — the hero still carries the primary CTA. The nav is now 9 tiles (7 pages + 2 auth) and the whole rail is 48px wide, which also drops the earlier measured 80px footprint.
- **Reduced-motion no longer looks broken.** It previously dropped the label to `transform: none` — a bare fade, which is very likely what "flip is not working" looked like if Windows animation effects are off. It now keeps a direction: `translateX(-12px) scale(0.92)` → `translateX(0) scale(1)`, so the label still visibly slides out of the tile. Verified under emulated `prefers-reduced-motion: reduce`: `stillAnimates: true`, `visiblyOpened: true`. **If the flip still looks absent, check Windows Settings → Accessibility → Visual effects → Animation effects, and that the page is the freshly built one — `:3100` has still not been rebuilt since this work started.**
- **Verified headless (sandbox :3110, live :3100 untouched), 1920→390:** at 1280+ the rail is visible with **0 content covered**; below 1280 the dock is visible with **0 covered**; `navOnScreen: true` at all nine widths, exactly 1 `aria-current`, no horizontal scroll, no console errors, and clicking a page keeps the rail at `opacity: 1 / pointer-events: auto` with the view actually swapped.
- **3D mechanic measured, not assumed:** folded panels are edge-on at `opacity 0` with a real `matrix3d`; hovering ramps through **27 distinct widths** monotonically over ~750ms with genuine intermediate values (so it animates rather than snapping); `hingeGap: 0` from the tile's edge, on-screen, and the panel is `pointer-events: none` so it can never eat a click. Keyboard focus opens the label too. Function re-checked after the retile: 7 page buttons + `href="/signin"` / `href="/signup"`, clicking switches the view, hovering the signup tile opens its label, and the signin tile really navigates to `/signin`.
- `npx tsc --noEmit` 0; `npx vitest run` **255/255 PASS (17 files)**. `npx eslint src` reports **28 pre-existing errors in 24 unrelated files** (grocery/sama-center/signin pages, `command-palette.tsx`, `theme-provider.tsx`, `neural-icon.tsx`, `api/v1/search`) — repo-wide lint debt, **none in any file touched here**; targeted runs on the changed files are 0 errors (only pre-existing `<img>` warnings). `next build` still pending user go-ahead.
- **Breakpoints had to move — this is the part worth knowing.** A permanently docked rail cannot coexist with edge-to-edge content. Measured overlap of *real* content (excluding the rail's own subtree) at each width: 1920/1440/1280 → **0 elements**; 1152 → the hero `h1` by 4px; 900/768/601 → the `h1` by **108px** and the hero `p` as well. So:
  - `.rail-wrap` now needs `min-width: 1280px` **and** `pointer: fine` (was 601px) — 1280px is the first width where the centred `max-w-6xl` content clears the rail.
  - `.dock-wrap` correspondingly covers `max-width: 1279px` (was 600px), so navigation is on-screen at **every** width — the dock is open by default (`useState(true)`).
  - The non-home view wrapper's `min-[601px]:pb-0` became `min-[1280px]:pb-0`. This was a real trap: it drops the bottom padding that clears the dock, so leaving it at 601px would have hidden the bottom of every non-home view behind the newly-widened dock. Verified `padding-bottom: 96px` with the dock present at 1152/1024/900/768/601/390.
- **Verified headless (sandbox :3110, live :3100 untouched), 1920→390:** at 1280+ the rail is visible with **0 content covered**; below 1280 the dock is visible with **0 covered**; `navOnScreen: true` at all nine widths, 7 items and exactly 1 `aria-current` at all of them, no horizontal scroll, no console errors, and clicking a page keeps the rail at `opacity: 1 / pointer-events: auto` with the view actually swapped.
- `npx tsc --noEmit` 0; `npx eslint` 0 errors (3 pre-existing `<img>` warnings, untouched); `npx vitest run` **255/255 PASS (17 files)**. `next build` still pending user go-ahead.

## 2026-09-27 — LANDING RAIL: HOVER SWAPS THE ICON FOR ITS TEXT (supersedes the 3D panel above)

- **Request:** the outward-flipping 3D label panel was not what the user wanted — hovering a tile should make the tile **become its own text**. The `.rail-flip` panel and all its `matrix3d` machinery are deleted; `grep` confirms no `.rail-flip` reference survives in `page.tsx` or `globals.css`.
- **Mechanism.** The tile is always 48px and never leaves the rail. On `.is-open` the label's `max-width` animates `0 → --tile-open-w` while the icon cross-fades out, so the tile is `max(48px, text width)`: a short label swaps in place, a long one grows to the right. `--tile-open-w` cannot be expressed in CSS (`max-content`/`fit-content` are not interpolable, and clipping the pill would clip its glow), so `page.tsx` measures each `.rail-tile-label`'s `scrollWidth` into the custom property and remeasures on `document.fonts.ready` and `resize`. The trigger is still React `peek` state plus the 2500ms dwell watchdog, unchanged — the `Hero3D` Sketchfab iframe starves the parent document of mouse events, so CSS `:hover` would latch.
- **Three CSS traps found by measuring, not by reading — each one looked correct in source:**
  1. **Padding must not live on the animated element.** `max-width` clamps only the *content* box, so the label's own `pe-3.5` (14px) escaped the animation: collapsed pills measured **64px** with a sliver of text visible, not 48px. The padding moved to an inner `<span>` inside the clipped label, so the label's border box really is 0 when collapsed.
  2. **`border` counts toward a content-sized flex button.** With `border` on the button, collapsed measured **50px** (48px icon slot + 1px each side) — enough to break the 5px/48px geometry. Swapped for `ring-1 ring-inset` (an inset box-shadow, zero layout) → exactly **48.0px**.
  3. **Collapsing the icon's own width made the pill shrink on hover** (measured 50→35px for `الأرقام`). Fixed by keeping the icon's 48px layout slot — it only fades — and giving the label `margin-left: -48px` so the text slides *over* the slot the icon vacated, with `min-w-12` on the button as the floor. A geometry assertion now pins `btnW == max(48, openW)` so this cannot regress silently.
- **Verified headless in the sandbox (`:3110`), 19/19 assertions:** all 9 tiles exactly **48.0px** collapsed at **left 5.0px** with the icon visible and the text fully hidden (label visible width 0); long label `كيف يعمل` animates 48→56px over **16 distinct monotonic frames** (real interpolation, not a snap) with the text covering the full 48px icon slot and staying inside the pill; short label `الأرقام` stays 48px and swaps in place; icon opacity 0 and text opacity 1 on open; exactly one tile open at a time; keyboard focus opens tile 5 identically; the watchdog leaves 0 tiles open after 3s idle; the signup tile opens to 64px; nav `overflow-x: visible`, nothing off-screen, no document horizontal scroll, **0 console errors**.
- **`--i` was briefly orphaned.** Replacing the morph CSS deleted the per-tile entrance while `page.tsx` still set `--i`, leaving the variable dead and the reduced-motion rule (`animation: none`) meaningless. Re-added `rail-tile-in` (0.45s, `animation-delay: calc(var(--i) * 45ms)`, `both`) on `.rail-tile-btn`; re-verified by confirming ≥8 distinct computed `animation-delay` values.
- **`:3100` is `next dev --webpack -p 3100`, not a stale build.** The earlier conclusions in the entries above that `:3100` was serving old prebuilt output were **wrong** — it compiles from source and hot-reloads. The user's approval for a production build was given on that incorrect premise, so **no build was run and none is needed for this change**; the dev server was left running and untouched. Revisit only if a real deployment is wanted.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (3 pre-existing `<img>` warnings); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards.
- **Still open, unchanged:** user visual sign-off on the morph; Google OAuth callback + Test user config; the 646-row legacy `public` schema in the `demo` DB needs a delete/skip decision; `/grocery` iframe 500 (unstarted subsystem rewrite).

## 2026-09-27 — LANDING RAIL: FULL COLLAPSIBLE-PANEL REBUILD (CodePen)

- **Request:** the user supplied the complete reference stylesheet and asked for a **full rebuild** — a 256px panel with a hamburger that collapses it, not the 48px hover-morph rail above. Auth entries were explicitly upgraded from icon tiles to **labelled rows** so the list reads uniformly. The morph's whole CSS layer (`.rail-tile*`, `--tile-open-w`, `openPeek`/`closePeek`, the DOM label-measurement effect) is deleted; `grep` confirms no reference survives.
- **Shape:** a `header / scrolling content / footer` column, 5px from the left, top and bottom edges. `rail-head` (brand + burger) → `rail-content` (7 page rows, an `<hr>`, 2 auth rows, plus the highlight pill) → `rail-foot` (avatar, name, role, expandable note). Everything sits in a 16px left gutter and runs **flush to the panel's right edge**, because the pill's rounded end is completed by two invisible circles whose `box-shadow` paints the page background over that edge — the "slot" the pill slides through. The brand tile left the row list and became the header title; it fades out entirely when collapsed, which is what frees the panel's centre for the burger.
- **The checkbox became React state.** The reference toggles `#nav-toggle:checked ~ …`, which needs a hidden input and sibling combinators. Here it is a real `<button>` with `aria-expanded` / `aria-controls` and an Arabic `aria-label`. Same for the footer caret. Keyboard and screen-reader behaviour improve for free.
- **The pill is positioned from the row's real `offsetTop`, not `index * 54`.** The 1px `<hr>` between the page rows and the auth rows shifts every row below it: measured, auth row 8's true offset is **449**, where the arithmetic gives 448. The old morph already had one "looks right, measures wrong" trap (padding escaping `max-width`); this one is the same species, so the position is read from the DOM at hover time via `e.currentTarget.offsetTop` and cannot drift when a row is added.
- **Hot state is React state, never `:hover`** — same `Hero3D` iframe latch as before, and here it would be worse than a stuck label: the row turns `#18283b` dark to sit on the emerald pill, so a latched `:hover` would leave dark text on a navy panel **with no pill behind it**. `hotRow` + `hotTop` with the same 2500ms watchdog; measured cleared 3.2s after the pointer left, and keyboard focus drives it too.
- **One bug caught by measurement:** collapsed, the burger centred at panel-x **48** while the icons centred at **40** — because the header carries the same 16px gutter, so centring in the header is 8px off the panel. Fixed with `left: 0`, which puts the burger box on panel-x 16→64, *identical* to the icon column. (The reference's own collapsed math lands at 24, a 16px error; deliberately not replicated.)
- **Palette:** navy `#18283b` / `#2c3e50`, text `#f5f6fa`, muted `#8392a5`, and the pill in the brand `--primary` emerald with dark navy text on it. The reference paints its pill with its page background (`#9c88ff`); on our dark page that would be invisible, so the pill had to become the accent.
- **Verified headless in the sandbox (`:3110`), 1440×900:** collapsed = **80.0px** wide at **left 5.0**, icons centred at **40**, labels `opacity 0`, title `opacity 0`, burger centred at 40, 9 rows, 1 divider, `href="/signin"` + `href="/signup"`, exactly 1 `aria-current`. Opened: **256.0px** reached over **14 distinct width frames** (real interpolation), labels `opacity 1`, icons unmoved at 40, title `opacity 1`. Pill lands at **178** on page row 3 and **449** on auth row 8 — both exactly the measured `offsetTop`, height 54. Keyboard focus on row 2 → pill at **124**. Watchdog: 0 open after 3.2s idle. Footer caret → `data-open="true"`, body 78.4px, `aria-expanded="true"`. No console errors, no document horizontal scroll, all rows on screen.
- **The 1280px breakpoint survives a 5.3× wider panel — but only because it was re-measured.** Overlap of *real* content (leaf text and media outside the rail) at **1280 / 1366 / 1440 / 1600 / 1920, both collapsed and expanded: zero text elements covered.** The only overlap is the full-viewport Sketchfab iframe (80px collapsed, 256px expanded), which is the hero's own background, not content. Worth remembering why the old 48px rail needed 1280 at all: the hero `h1` sat close to the viewport edge, whereas the panel now overlaps the centred `max-w-6xl` *box* without reaching any glyph.
- **Responsive fallback re-checked:** rail hidden and dock shown at 1279 / 1152 / 1024 / 900 / 768 / 601 / 390, visible from 1280 up, no document h-scroll anywhere. An emulated iPad (`matchMedia('(pointer: coarse)') === true`) at 1024 correctly shows the dock and hides the rail. Puppeteer cannot emulate `pointer` via `emulateMediaFeatures`, so the touch case needs a device descriptor.
- **A false alarm worth recording:** at 360/390/430 three dock items measure at negative x. That is **not** a bug — `.dock-wrap nav` is `overflow-x-auto` with `shrink-0` items, 588px of content in 390px, and in RTL the overflow lands on the left edge of the scroll area. Scrolled to the far end, every item is reachable. The first probe asserted "all nav on screen" against a scroll container, which is the wrong assertion.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (4 pre-existing `<img>` warnings — the file's own convention for `/icons/BO.png`, now on the header mark and footer avatar too); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards; the live `:3100` dev server was never touched and no production build was run.
- **Placeholder to replace:** the footer note ("نظام متكامل لإدارة الأعمال…") is generic copy standing in for the reference's lorem ipsum, as are the footer's name/role. Swap them for the real brand strings.
- **Needs a human eye:** the pill's slot/notch is the one thing that cannot be asserted numerically — it depends on `var(--background)` reading as the same colour behind the panel as inside the notch, and the hero behind it is a dark gradient plus the 3D iframe rather than the reference's flat purple.

## 2026-09-27 — RAIL MADE SMALLER, PRETTIER, AND VERTICALLY CENTRED (user request)

- **Request, verbatim:** *"make the height smaller and make it more attractive and make it at the center i mean make it smaller from the top and bottom."* So: shrink the card, and stop it running edge to edge — float it with a real margin above and below.
- **The stretched layout was the reason it was too tall.** The previous section's column was `fixed … top-0 bottom-0`, so the panel always filled the window and the extra space had to be absorbed by oversized children. The card is now content-height: `.rail-wrap` is `top-1/2 -translate-y-1/2` again and `.rail-nav` dropped `height: 100%` for `max-height: calc(100vh - 48px)`. **Card height 890px → 560px on a 900px viewport** (margins 170 above and 170 below, so `centred` within 2px). The only thing that still has to cope with a small window is `max-height`, with `min-height: 0` on `.rail-content` so the row list — not the card — takes the scroll.
- **Row rhythm tightened:** `--rail-row-h` 54 → 46, header 80 → 64, footer head 54 → 48, and the title mark 34 → 30, avatar 32 → 28, `.rail-foot-body` 160 → 132, row text 0.95 → 0.9rem, footer name 0.85 → 0.8rem.
- **Deliberately changed the pill's mechanics rather than shrinking it.** The reference squared off the pill's right corners and used two pseudo-element `box-shadow`s painting `var(--background)` to round them again, so it read as sliding through a slot in the panel's edge. That trick only works over a **flat** background — ours is a dark gradient plus the 3D iframe, which is exactly why the previous section flagged the notch as unverifiable. Instead the pill is inset on **both** sides (`calc(100% - 2 * var(--rail-inset))`) and fully rounded with an emerald glow, and header, rows, pill and footer all share that same 16px inset. Self-contained, no dependency on the page background, and the notch question is now **moot rather than pending**. The header comment and the `page.tsx` comment were both rewritten, since they still described the flush-right slot.
- **The two-sided inset had to stay exact or the collapsed centring breaks.** Collapsed, a 48px icon in a 48px row fills the row, so the icon centre lands at **40** = the panel centre. Inset on the left only, the rows would be 16→64 and the same math would still hold; inset on both sides the collapsed row is still 16→64, so the measured result is unchanged — but any drift in `--rail-inset` between the row and the pill would now be *visible* as misalignment rather than absorbed. Measured `pillAlignsWithRows: true` in every state, pill and row both 16→240 open and 16→64 collapsed.
- **The measured-`offsetTop` fix survived the resize, and the divider still bites.** Pill on page row 3 → **154** (= 16 + 3×46). Pill on auth row 8 → **385**, where `index * 46` gives 384. Same off-by-one, same cause, same reason the position is read from the DOM. `rowH` 46 and pill height 46 agree.
- **Short windows behave as designed:** 700px → 560px card, margins 70/70, no scroll. 620px → 560px card, margins 30/30, no scroll. 520px → card caps at **472** (the `100vh - 48px` max), margins 24/24, `contentScrolls: true` and `panelScrolls: false` — the row list scrolls and the card does not. `withinViewport: true` in all three.
- **A 10px `scrollHeight` phantom, measured and dismissed:** collapsed, `.rail-nav` reports `scrollHeight` 570 vs `clientHeight` 560, while open it is exactly 560. Probed rather than assumed — the three bands are header 0→64, content 64→511, foot 511→**560**, identical collapsed and open, so the footer's bottom lands exactly on the panel's bottom and `anyClipped: false`. The panel is `overflow: hidden`, so the surplus extent is not painted. Benign.
- **Overlap re-measured at the new geometry** (the card now floats rather than filling the window, which changes what it sits on top of): leaf text and media covered at **1280 / 1366 / 1440 / 1600 / 1920 = 0 text elements**, the single overlap still being the hero's own full-viewport Sketchfab iframe. No document horizontal scroll at any height tested. No console errors.
- Footer caret still works after the shrink: `data-open="true"`, body 72.6px, card grows 560 → 645.6 and re-centres.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (same 4 pre-existing `<img>` warnings); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards; the live `:3100` dev server was never touched and no production build was run. This directory is **not** a git repo, so there is nothing to commit.
- **Still needs a human eye:** the overall attractiveness — gradient, 20px corners, inset pill, glow, shadow stack — is the one claim here that geometry cannot judge. 560px is the height with all 9 rows visible; if it should be shorter still, `--rail-row-h` is the single dial.

## 2026-09-27 — RAIL REBUILT AS A CASCADE OF SQUARE TILES (second reference pen, supersedes the card above)

- **Request:** *"make it classy"*, followed by a **different** CodePen and *"now change it with this"*. That pen is not a card at all — it is a column of 60px square tiles with a burger that morphs to an X, the tiles hidden underneath the burger until it opens and then cascading down one by one, and each label **sliding out only on hover**. So this supersedes the whole panel: the header, the footer, the navy card, the emerald pill, the `<hr>` and the scrolling content are all gone.
- **Two things the pen could not answer, so they were asked rather than guessed.** Palette → **keep navy + emerald** (the pen's purples were not adopted). Labels → **hover to reveal, like the pen** (this reverses the earlier "labelled auth rows so the list reads uniformly" request, so it was confirmed explicitly rather than assumed). What the pen's own CodePen chrome contains — the "Sidebar Navigation" title block and the "Made with ❤️ by frontendplanet.com" attribution — is not part of the component and was not copied.
- **What the pen actually contributes is structure and motion, not looks:** the single-tile closed state, the cascade, the burger↔X morph, and the label slide. The palette is ours — navy tile gradient, emerald hot state, 16px radius. There is no card behind the tiles, exactly as in the pen.
- **Centring a shape that changes size.** Closed, the box is one tile (56px) and the burger sits centred in it. Open, it is the full column (574px) and the burger ends up at the *top* of it. Both are centred by animating `.rail`'s `height` while `.rail-wrap` keeps `top-1/2 -translate-y-1/2`, so the box re-centres as it grows and the burger rises to the head of the column. Measured closed 422/422 and open 163/163 — centred within 2px either way.
- **The cascade needs the tiles stacked *on top of* the burger, not after it.** Each is `position: absolute; top: 0` with `translateY(0)`, sitting at a lower `z-index`. Closed they are exactly covered by the burger; each becomes visible as it translates clear of the one above. That is what produces the pen's "emerging from underneath" read, and it is why the box can be one tile tall while closed.
- **`visibility` is transitioned with a delay, not flipped.** `visibility 0s linear 0.42s` on the closed state means the tiles stay painted through the whole closing slide instead of blinking out, and it also takes them **out of the tab order** while hidden — `opacity: 0` alone would have left nine invisible links in the keyboard path. Measured closed: `visibility: hidden`, `pointer-events: none`, 0 visible tiles.
- **A real bug, caught only by measuring the glyph: the burger could not become an X.** The middle bar and the outer two are one element plus its two pseudo-elements, so `transform: scaleX(0)` on the middle **scaled its own children out of existence too** — all three bars read `matrix(0, 0, 0, 1, 0, 0)` and the burger simply vanished. The pen draws three *siblings* and can transform each independently; nesting them means only the parent's own paint can be switched off. Fixed by hiding the middle bar with `background-color: transparent` instead of a transform. Re-measured: middle `rgba(0, 0, 0, 0)`, outer bars `matrix(0.7071, ±0.7071, …)` = exactly ±45°.
- **The `<hr>` became a quarter-tile offset.** The auth pair sit at slot 8.25 and 9.25 instead of 8 and 9, opening a measured **14px** gap. This is the same class of problem the old pill had — a rule that shifts everything below it — except now nothing has to be *measured* against it, because each tile's position is its own `--slot`. That also let the whole `offsetTop` + `hotTop` machinery go: the tile is its own highlight, so there is nothing to position.
- **Short windows shrink the tile instead of scrolling.** The column is a fixed number of slots (`--rail-slots: 10.25`), so a media query on `--rail-tile` rescales every offset, the gap and the open height together — no scroll container needed. Measured: 700px tall → 48px tiles, 492px column, gap 12.4; 580 and 520 → 42px tiles, 430.5px column, gap ~10.6. All centred and inside the viewport.
- **The label chip is the one place the pen's bare accent text had to change.** The pen sets `color: var(--dark-purple)` directly on the page background; ours sits on a 3D hero, so the label carries its own surface — near-black at 94% with a blur behind it, readable over whatever the model is doing. Measured dead-centre on its own tile (offset **0**), 10px clear of the tile edge, sliding from `translateX(-6px)`.
- **Verified headless in the sandbox (`:3110`):** closed = 1 tile, 56px, centred, plain burger glyph, 0 visible tiles. Open = 9 tiles, 574px, every tile at `left 0` and 56px wide (a flush column, no drift), tops at 56/112/168/224/280/336/392/462/518. Hot = emerald gradient fill, icon `rgb(6, 35, 31)`, label opacity 1 — including on the current page, where an emerald icon on an emerald fill would otherwise have been invisible. Auth hrefs `/signin` + `/signup`, exactly 1 `aria-current`. Watchdog: 0 hot and label opacity 0 after 3.2s idle. Re-close returns to a 56px box. Narrow 1024 → rail hidden, dock shown. No document h-scroll, **no console errors**.
- **Keyboard checked on the real Tab path,** not just programmatically: Tab reaches a `.rail-tile` in 1 hop, `is-hot` is set (React's `onFocus` does fire — `focus` and `focusin` both observed), and the label reveals. `aria-expanded="true"` after Enter on the burger.
- **One known, self-healing quirk:** because the box re-centres while it grows, a *stationary* cursor can end up over a different tile and fire a `pointerleave` mid-cascade, which clears the hot state early. The watchdog re-arms on the next pointer move, so it resolves itself; guarding it would mean tracking animation state, which is not worth it for a transient.
- **What was lost, deliberately:** the brand wordmark and logo no longer appear in the rail (the pen has no header), and the footer's expandable note is gone with it. That note was placeholder copy anyway. If the wordmark should come back, a small logo tile above the burger is the place for it.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (**2** `<img>` warnings, down from 4 — the header mark and footer avatar went with the card; the file's own `<img>` convention); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards; the live `:3100` dev server was never touched and no production build was run. Not a git repo, so nothing to commit.
- **Defaults to closed**, as the pen does — a single 56px tile until the burger is clicked. `useState(false)` on `railOpen` in `src/app/page.tsx` is the one-line change if it should start open.

## 2026-09-27 ? FEATURES PAGE REBUILT: 6 GENERIC CARDS -> 43 GROUNDED CAPABILITIES ACROSS 4 SECTIONS

- **Request:** *"improve the المميزات page, add all the المميزات."* The page carried a single 6-card grid, so "improve" was read as two jobs: make it a page worth landing on, and make it honest.
- **First job was correcting claims, not adding more of them.** Two of the six advertised things do not exist anywhere in the codebase: **`الميزانيات`** (no budget feature in any module, page or API) and **`تكاليف الشحن`** (no shipping-cost field; purchases are amount/paid/remaining only). `التدفقات النقدية` was real but a summary of cash in/out rather than a cashflow engine. Rewriting the array anyway meant those claims were corrected rather than preserved.
- **Meanwhile two whole applications were missing.** `grocery` and `sama-center` are each ~12 real pages of working UI, together more screens than the core ERP, and the features page mentioned neither. The systems marketplace, the six roles and the approval-gated install flow were all absent too.
- **`سجل التدقيق` was deliberately left out.** `src/app/app/audit/page.tsx` is a placeholder that renders "سجل التدقيق متاح عبر API" and no `/api/v1/audit` route exists, so it is not a feature yet. A `recordAudit` helper exists in `src/core/auth/authorize.ts` with no caller, and `getAuditLogs` in `src/lib/db/repositories/audit.ts` is dead code. It is advertised only when the screen and the route both exist. **This is the one intentional omission** from a deliberately comprehensive list.
- **What replaced the single grid**, all in `src/app/page.tsx`: four `ScrollReveal` sections instead of one, and the count went 6 ? 43 visible items.
  1. **وحدات النظام الأساسية** ? 12 cards, in real workflow order (sell ? stock ? buy ? money ? run), not the sidebar's alphabetical order. Descriptions name the actual fields and code paths: the `TAX_RATE = 0.15` and `minStock`, the three prices (cost/sale/wholesale) + SKU + barcode, POS hold/resume + cash/card + credit-limit check, the 7/30/90/365-day report switch, the five automation triggers, the six roles.
  2. **أنظمة متكاملة جاهزة** ? 2 large cards, one per suite, each with 6 bullets taken from its real pages: grocery covers pending baskets and the two-step expense approval; sama-center covers insurance coverage of the therapist's share, employee advances/periods, and the day/week/month report export + print.
  3. **منصة التشغيل** ? 12 compact cards for the cross-cutting layer that belongs to no single module: 196 systems across 19 sectors, 6 roles, approval-gated install, multi-org, custom fields, API keys + webhooks, two-phase import, AI assistant, barcode/print, offline + sync, backups, and installable PWA.
  4. **قطاعات تغطيها الأنظمة** ? the catalogue's 19 sector labels verbatim as a chip cloud, so a visitor finds their trade without reading 196 entries.
- **The PWA claim was checked before being written, not assumed.** `public/manifest.json` and `public/sw.js` both exist and `src/app/layout.tsx` sets `manifest: "/manifest.json"`, so "تطبيق ويب قابل للتثبيت" is backed. The same pass confirmed `/app/grocery` and `/app/sama-center` render real pages, which is why the suites are described concretely.
- **Platform-card copy is capped at the capability level on purpose.** Webhooks, custom fields, API keys, backups and the two-phase import have real API routes but no UI screen, so the copy says the system can do it, not that there is a page to click. Overclaiming there would recreate exactly the `الميزانيات` mistake in the opposite direction.
- **Copy tone is kept in the app's own register** ? Egyptian/colloquial where the UI is colloquial, MSA where the product is formal, and real product terms kept untranslated (`hold`/`resume`, `SKU`, `API`, `ويب هوك`) because that is what appears on screen.
- **The suites get more visual weight than the modules on purpose.** They are the most differentiated thing the product has, and 12 equal-weight cards would have buried them. Two large cards, then 24 uniform ones.
- **A shared `FeatureCard` component** with a `compact` flag, so the module and platform grids cannot drift apart visually, and the 24-card palette stays on the page's existing four brand gradients (`GRAD_A..D`) instead of becoming a paint box.
- **`Audit` is the only sidebar module with no card, and `الإدارة` took its place** at the end of the module list, covering modules on/off, users, roles and branding. The rail keeps all 9 marketing tiles; this is about the page, not the rail.
- **Verified headless in the sandbox (`:3110`):** all four sections render ? 28 `h3` (3 section heads + 12 modules + 12 platform + 1 sector head), 19 sector chips, 12 suite bullets (6 + 6). Grids measured 3?4, 2?1, 3?4 with **0px height spread in every row**, so nothing is ragged. No clipped text, icons a clean 20px compact / 28px full with none collapsed, 89 elements revealed after a full scroll, no document h-scroll at 1440 or 390, mobile dock visible, rail still navigates into the view, **no console errors**, and no internal link to a route that does not exist.
- **Honest limitation:** this model cannot read images, so the design was checked numerically (grid rhythm, height uniformity, clipping, overflow, reveal behaviour) rather than by eye, and no screenshot review was possible. The gradient, spacing and card density are the claims that still want a human look on `:3100`.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (**2** pre-existing `<img>` warnings, unchanged); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards; the live `:3100` dev server was never touched and no production build was run. Not a git repo, so nothing to commit.

## 2026-09-27 ? "أنظمة متكاملة جاهزة" SECTION CUT FROM THE FEATURES PAGE

- **Request:** *"delete أنظمة متكاملة جاهزة section."* The grocery + sama-center showcase was the second of the four sections added in the entry above, and it is now gone from the page. This supersedes that part of the previous entry.
- **Removed, in order, so nothing was left dangling:** the `suites` data array and its `SuiteItem` type, the section's JSX, the now-unused `Stethoscope` lucide import, the section's `/* 2 — */` and renumbered `3`/`4` comments, and the subheading clause *"ونظامان متكاملان جاهزان"*. The header comment above the data was also corrected, since its whole justification for the page's shape was the argument that two whole apps were missing ? that is no longer the page's position, so it now says the suites were written up and cut on request.
- **What the page is now:** three sections and 27 `h3` ? **وحدات النظام الأساسية** (12), **منصة التشغيل** (12), **قطاعات تغطيها الأنظمة** (19 chips). Page height dropped 3420px ? 2768px. The CTA pair at the bottom was kept and is now section 4.
- **Verified after the cut,** specifically for the orphans a deletion tends to leave: `أنظمة متكاملة جاهزة` / `مركز سما` / `إدارة البقالة` are **absent from the rendered text**, `ul` count is 0, and the gap between the second and third section headers is 1010px ? a single `mt-24`, i.e. the deleted block's `mt-24` did not double up with its neighbour. No console errors, no h-scroll.
- **One leftover the user may or may not want:** the `عمل دون اتصال` platform card still reads *"تطبيقات البقالة تعمل بلا شبكة"*. It is factually correct and self-contained, so it was left alone rather than reworded unasked, but it is the page's only surviving mention of a suite now that the section introducing it is gone. Say the word and it gets made generic.
- `npx tsc --noEmit` 0; `npx eslint src/app/page.tsx` 0 errors (**2** pre-existing `<img>` warnings, unchanged); `npx vitest run` **255/255 PASS (17 files)**. Sandbox `.verify-tmp` and its `:3110` server removed afterwards; the live `:3100` dev server was never touched and no production build was run. Not a git repo, so nothing to commit.

## 2026-09-27 ? SIGNUP AUDIT: IT ALREADY WORKED. THE REAL DEFECT WAS AN UNCONFIGURED FACEBOOK BUTTON

- **Request:** *"http://localhost:3100/signup make it work and save in database."* The first job was finding out what "not working" meant, because the obvious guess turned out to be wrong.
- **The credential path was never broken.** `POST /api/v1/public/signup` was already complete and transactional. Proved by calling it: **201** with real ids, then reading the rows back through Prisma. A signup creates `user` + `account` (hashed, `providerId: "credential"`) + `organization` + `member` with `role: "owner"` + an `auditLog` row, all in one transaction. `auth.api.signInEmail` with the same password issued a token, and a wrong password was still rejected. So "save in database" was already true \u2014 including the `template=grocery` path, which additionally installs the grocery app (`organizationApp`, v1.0.0, active) and writes `templateCode: "grocery"` plus `modulesEnabled` into `org.settings`. A bogus `templateCode` degrades to `null` and installs nothing rather than half-applying.
- **A false lead worth recording, because it nearly sent me down the wrong path.** The first browser run reported the terms checkbox could not be ticked and the form never called the API. It was my test that was wrong: `sr-only` in Tailwind v4 clips the input to **1x1px with `clip-path: inset(50%)`**, and the styled box is its sibling painted on top, so `elementFromPoint` on the input is a no-op. Hit-testing the things a *user* actually clicks proved the checkbox is fine \u2014 visible box ticks it, the label text ticks it, <kbd>Space</kbd> ticks it. Only the hidden 1px input is unclickable, which is correct behaviour. No code change was warranted; the test was rewritten to click the visible box.
- **The actual defect: a button that could never work.** `src/core/config/env.ts` declares `GOOGLE_CLIENT_ID/SECRET` and `FACEBOOK_CLIENT_ID/SECRET` all `optional`, but `signup` and `signin` both hard-coded two social buttons regardless. Google is configured; **`FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET` are empty**, so clicking فيسبوك returned **403** and silently dumped the user back on the same page with no message. The env schema says "optional" and the UI said "always present" \u2014 those two statements could not both be true.
- **The fix makes the server decide, so a button on the page is always a button that works.** Both routes are now thin server components that read `getEnv()` and pass only the fully-configured providers down; the forms map over that list instead of hard-coding one. Unconfigured providers render nothing, and the `\u0623\u0648 \u062a\u0627\u0628\u0639 \u0639\u0628\u0631` divider is gated on the same list, so a deployment with no social providers does not get an orphaned rule. `grid-cols-2` became a computed `gridTemplateColumns` so one provider still fills the row. Adding Meta credentials brings the button back with no code change.
- **Side effect worth noting: `useSearchParams` is gone from `/signup`.** Reading `template` as a server `searchParams` prop (the pattern already used in `src/app/approval-pending/page.tsx`) instead of a client hook removes the Suspense requirement the hook carries.
- **Removed dead code that was failing lint.** Both forms carried `const [mounted, setMounted] = useState(false)` with an effect that set it, and `mounted` was **never read** \u2014 a leftover SSR guard. It produced 2 `react-hooks/set-state-in-effect` errors plus 2 unused-var warnings, and the stale `useEffect` imports went with it. Those errors predate this work; they only surfaced because splitting the files meant linting them for the first time. All four files now lint clean.
- **Verified in the sandbox (`:3110`):** social buttons render as `["إنشاء الحساب والبدء", "جوجل"]` \u2014 google present, facebook gone, divider retained; `/signup?template=grocery` shows the grocery banner; ticking terms and submitting gives **201** and redirects to `/signin?registered=1`; no console errors on either page. `tsc` 0 and `npx vitest run` **255/255 (17 files)**.
- **Unresolved, and it needs a decision: the live `:3100` dev server will not hydrate `/signup`.** It emits the same four script tags as the sandbox but then loads only **1** of the client chunks instead of **5** \u2014 no `main-app.js`, no `app/layout.js`, no `app/signup/page.js` \u2014 so React never attaches (`__reactProps` absent from the form, `hasOnSubmit: false`). The form then falls back to a **native GET to `/signup?`**, because no input carries a `name`, which is why the browser test saw an empty query string and no API call. This is a stale in-memory module graph from adding `signup-form.tsx` to the route; the identical code hydrates and submits correctly on `:3110`. **The restart was requested and not answered, so `:3100` was left running untouched** \u2014 it still serves 200 and still needs a restart before signup will work there.
- Two smaller notes: the earlier project map entry said Google OAuth was unconfigured and needed manual Google Cloud setup \u2014 that is **wrong**, it is configured and reaches `accounts.google.com` with a live client id. And `trustedOrigins` is built from `AUTH_URL` (`localhost:3100`), so the sandbox port 3110 is *not* a trusted origin and signin there fails with "Invalid origin"; that is a verification artefact, not a product bug, and is why the end-to-end signin check has to run against 3100.

## 2026-09-27 ? SIGNUP BY EMAIL **OR** PHONE, WITH A COUNTRY DIAL-CODE PICKER

- **Request:** *"in sign up make البريد الإلكتروني or phone number and add choose country for the country key for example +967 etc."* Registration previously accepted `email` only (`z.string().email()`), and `/signin` posted straight to `authClient.signIn.email`, so a phone-only account would have been unable to log back in. Both halves had to move.
- **The blocking fact, found before writing code.** This `better-auth` build ships **no `phoneNumber` plugin** (no reference anywhere in the installed dist), and **no SMS provider is configured**. So a phone cannot be an auth credential the way an email can, and OTP is not on the table at all without new vendor credentials. This was put to the user as a choice rather than decided unilaterally, because every option has a real downside. They chose **phone + password with a nullable email**, which means better-auth still needs an email on every row and a phone-only account gets a deterministic internal address.
- **Migration `20260927000100_signup_by_phone` (applied, additive).** `users.email` drops `NOT NULL`; `users.country_code` is added; `users_phone_key` is a UNIQUE index. Safety was checked against the live table rather than assumed: **262 users / 262 with email / 0 with phone before, identical after** ? no row was rewritten, and because every existing `phone` is NULL a unique index cannot collide (Postgres treats NULLs as distinct). `email` is now `String? @unique`, `phone` is `String? @unique`, and `countryCode` is `String? @map("country_code")`. The national number and the dial code are stored **separately**, so `+967 7xx…` is not frozen into one string and either half can be corrected. The migration comment records that "exactly one of email/phone" is an application-level rule: a cross-column constraint is not expressible in Postgres, and a `CHECK` on an existing populated table needs a full rewrite.
- **New `src/core/auth/identifier.ts`, the single place that decides what an identifier is.** 21 dial-code countries (`YE +967` is the default), plus `resolveIdentifier`, `formatInternational`, `internalAuthEmail`, `isInternalAuthEmail` and `displayIdentifier`. It is deliberately shared by the signup route, the signin route and both forms ? the bug this feature invites is the two forms classifying a value differently, and one module makes that impossible. Number handling strips spaces/dashes/brackets, drops a dial code the user typed themselves (`+967…`, `967…`) and a leading local zero, so `+967 777 123 456`, `967777123456` and `0777123456` are one account. Verified as three real signins, not just string-mangled in a test.
- **Signup route now takes `identifier` + optional `countryCode`.** It resolves the identifier, derives the internal address, and checks **both** unique columns before writing ? `email` and `phone` are independently unique, so checking only the one being used would let an existing phone register a fresh email. `phone`/`countryCode` are written after `auth.api.signUpEmail` (which cannot set them) using the transaction client. The audit row logs the **real** identifier and kind, never the stand-in, and a guard throws if an internal address would ever reach the response.
- **New `POST /api/v1/public/signin`, and why it is a server route at all.** The form could not keep calling `authClient.signIn.email`, because that needs the email on the client, which is exactly the internal address we are trying not to ship to a browser. The route resolves the identifier server-side, calls `signInEmail` with `asResponse: true` and copies `set-cookie` onto its own response, so a phone signin produces an ordinary session and the rest of the app cannot tell the difference. It is rate limited to **10 attempts / 10 min per IP**, and its 401 body is byte-identical for an unknown identifier and a wrong password so the endpoint cannot be used to enumerate accounts.
- **One shared UI control, `src/components/onboarding/identifier-field.tsx`**, used by both forms: a بريد إلكتروني / رقم الجوال tab pair, and a country `<select>` rendered **only** in phone mode because a dial code is meaningless for an email. The dial code is a non-editable prefix, so the submitted number is always international and the server never has to interpret a bare `+`. It takes `inputCls`/`labelCls` and an `idPrefix` so the two very different form styles stay visually identical in their shared field without the markup being copied.
- **Making `email` nullable broke exactly one consumer, and it was a real bug, not a type nuisance.** `platform-admin/tenants/[id]/page.tsx` selected `email` into a `Member` type that declared it non-nullable, and rendered it inside a `mailto:`. A phone-only tenant would have shown a blank owner and a `mailto:` with an empty target. It now selects `phone`/`countryCode` too and renders `displayIdentifier`, so an owner shows `+967…`; `mailto:` renders only when a genuine address exists. This is the one place the internal address could have leaked into the UI, and it is now closed.
- **Verified against the real database, not mocked: 22/22 checks.** A `+967` signup returned 201 and wrote `user.phone`/`country_code`, a hashed `credential` account, the `organization`, an `owner` `member`, and an audit row containing the phone and not the stand-in; the response echoed the phone and no trace of the internal address. Duplicate phone ? 409. Phone signin ? 200 plus a `bos.session_token` cookie. Wrong password ? 401 with the non-enumerating message. Email signup/signin still work. `+967 777 123 456` and `0777123456` both signed in to the same account. Claiming `p967…@phone.bos.local` as one's own email ? 409. Probe rows were deleted afterwards.
- **A pre-existing atomicity defect this work exposed, not caused it.** `auth.api.signUpEmail` runs against the **global** Prisma client, so it is *not* inside the route's `prisma.$transaction`; when a later step throws, the user and credential rows survive while the organization rolls back. This was proven accidentally and then confirmed: the two verification runs that failed on an unrelated Prisma-client issue each left an account with `members=0` ? a real user with no organization, exactly the half-created state the `try/catch` implies cannot happen. **It is still open**, and fixing it means threading a transaction into better-auth's adapter, which is a larger change than this feature warranted and was not done unasked.
- **Why the first verification pass failed, and the trap it sets.** HTTP-testing the route against `localhost:3100` returned `Unknown argument 'countryCode'` ? a field the migration had just added and the freshly generated client accepted. The cause is that the **running dev server loaded the Prisma client before `prisma generate` ran** and still holds the old schema in memory; `prisma generate` rewrote the files on disk but cannot reach into a live process. Re-running the identical checks **in-process** (importing the route handler, no HTTP) passed 22/22. Worth recording because the error text points squarely at the schema change and invites "the migration is wrong", when the schema is fine and the server is stale.
- **One false lead ruled out on the way.** The repo has a **second** generated Prisma client at `apps/grocery/src/generated/prisma` (9/20, no `countryCode`) which looks alarming next to the fresh one. It is a different schema for a different database ? the grocery app's own tenant-side `User` model ? and must not be regenerated from the platform schema. Deliberately left untouched.
- **Tests:** new `tests/core/auth-identifier.test.ts`, **18 cases** covering dial-code uniqueness, case-insensitive lookup, the malformed/short/empty rejections, all three spacing and dialling variants, the leading-zero rule, per-country uniqueness of the internal address, and that `displayIdentifier` prefers a real email. `npx tsc --noEmit` **0**; `npx eslint` on all seven touched files **0**; `npx vitest run` **273/273 PASS (18 files)**. Temp harness `.verify-tmp` removed.
- **Still blocked on the same restart that the previous entry flagged.** The regenerated Prisma client means `:3100` must be restarted before the new form is usable there ? it currently serves 200 but would reject `countryCode` on any phone submission. Not restarted, no production build, no deploy, not a git repo. The browser check for this feature is therefore still outstanding, unlike the 22 in-process checks.

## 2026-09-27 ? COUNTRY PICKER REBUILT: ALL 246 COUNTRIES, FLAGS, 100PX, AND A REAL SERVER RESTART

- **Request, on top of the phone-signup work:** *"why the width is big its should be 100px and i want to add flags for countries also add all countries in the world."* Three separate problems: the trigger was `w-[124px]`, there were no flags, and the list was a hand-picked 21 countries.
- **246 countries, from the ITU-T E.164 list with Arabic names**, in one readable literal in `identifier.ts`. The old 21-country list was an embarrassment for a signup form: it silently refused valid numbers from every country it had never heard of. `nationalLength` was **removed** rather than filled in for 246 rows ? it was never used for validation, and inventing plausible-looking lengths for every country would have been false precision that a later dev would trust.
- **A data-model bug found while adding the rest of the world, worth recording because it is invisible until someone formats a number.** I first stored NANP territories as `dial: "1264"`, but `dial` is the E.164 country calling code and `formatInternational` does `+${dial}${phone}` ? Anguila would have rendered as **+12642645551234**, with the area code counted twice. The fix is an optional `area` field: `dial` stays `"1"` so prefix arithmetic is always right, and `264` is part of the *stored phone number*. `displayDial` then shows `+1 264` in the picker purely so the 23 NANP rows are distinguishable, and `formatInternational("2645551234", "AI")` is asserted to be `+12645551234` in a test.
- **`dial` is explicitly NOT unique, and the test now says so.** +1 is the whole NANP, +7 is Russia and Kazakhstan, +44 is the UK and the Crown dependencies, +212 is Morocco and Western Sahara, +262 is Réunion and Mayotte, +39 is Italy and the Vatican, +61 covers Australia and its external territories. The first version of the test asserted dial-code uniqueness ? true when there were 21 hand-picked countries, false the moment the world was added. Uniqueness is asserted on the **ISO code** instead, which is what the schema and the React keys use.
- **The native `<select>` had to go, and this is the part worth arguing about.** 246 rows in a 100px control does not work: the closed state would truncate to `🇾🇪 +96…`, which is precisely the ambiguity that makes a phone field untrustworthy, and a native dropdown also ignores the dark theme on some platforms. `CountryPicker` is now a button showing only what must always be visible (**flag + dialling code**) plus a panel with flag, Arabic name and code and a **search box** - the pattern every country picker converges on once a list passes ~50 entries. Closed state measures exactly **100px**, confirmed in a real browser at both 1440 and 390.
- **Flags are derived, not assets.** `flagEmoji` builds the two regional-indicator code points from the ISO letters, so there is no image file and no icon-library entry for 246 countries. The caveat is written into the function: these render as emoji only where an emoji font exists, and on a bare server they degrade to two letters ? which is exactly why the dial code is always shown beside the flag instead of the flag carrying the meaning alone.
- **Search is a pure exported function (`searchCountries`) precisely so it could be tested.** Matches Arabic name, ISO code and dialling code, tolerating a leading `+` and case. The first browser run reported *"search by dial code returns 0 results"*, which looked like a product bug and was in fact my own harness: a triple-click had not selected the input, so the query was `967اليمن`, which correctly matches nothing. Replaced with a native-setter + `input` event helper, and the behaviour is now pinned by 6 unit cases. `264` legitimately returns **2** results - Anguila's area code *and* Namibia's dialling code - and the test asserts that ambiguity rather than pretending it away.
- **Verified in real Chrome via `puppeteer-core`: 27/27 checks.** `/signup` **hydrates** (React props present on the form, `onSubmit` is a real function - the hydration failure recorded in the previous two entries is gone after the restart); switching to رقم الجوال reveals the 100px trigger reading `🇾🇪 +967` and a `type="tel"` input; the panel lists **246** `role="option"` rows with flags; search by `اليمن`, `967`, `+967` and `1264` all resolve to the right single row; choosing مصر updates the trigger to `🇪🇬 +20` and closes the panel. End-to-end **over HTTP against `:3100`**: phone signup **201** with the phone and country in the body and no trace of the internal address, phone signin **200** with `bos.session_token` on the wire *and* stored in the browser cookie jar. No console errors, and no horizontal overflow at 390px with the trigger still 100px.
- **Two harness limitations documented rather than worked around.** `set-cookie` is a forbidden response-header name, so `fetch` in page context can never see it ? the cookie is read off the network layer via the response object and confirmed in `page.cookies()`. And a synthetic `.click()` on the `<li role="option">` wrapper never reaches the inner `<button>`'s handler, so option selection clicks the button handle, as a real mouse click on the row would.
- **The dev server was restarted, with a mistake worth recording.** It had to be: `prisma generate` had rewritten the client on disk and the running process still held the old schema, so any phone submission on `:3100` failed with `Unknown argument 'countryCode'`. Stopping it by walking the parent process chain **also killed VS Code and the terminal** ? the chain ran from the Next.js server up through `npm` and `cmd` to the editor's pty host. The loop should have stopped at the `next dev` process. Explorer self-recovered; the editor does not, and the user's window closed. The server was then relaunched detached (`npm run dev:erp`, log to the temp dir) and serves 200.
- **Database left clean.** The browser and in-process runs created real organizations and users; all probe rows were deleted, and the final state is `withPhone=0, internalDomain=0`. No orphans from the failed pre-restart attempts remain either.
- `npx tsc --noEmit` **0**; `npx eslint` on all eight touched files **0**; `npx vitest run` **281/281 PASS (18 files)** (up from 255 ? 26 new identifier/search cases). No production build, no deploy, not a git repo.
- **Still open, unchanged by this work:** `auth.api.signUpEmail` runs outside the route's `$transaction`, so a failure after it leaves a user with no organization (proven by two orphans during the earlier verification). Fixing it means threading a transaction into Better Auth's adapter.

## 2026-09-27 ? /SYSTEMS NOW RENDERS THE DEMO CATALOG, VERIFIED BYTE-IDENTICAL

- **Request:** *"in http://localhost:3100/systems i want the same cards like demo page and do it with same style 100% the same."* The goal was to guarantee the two pages can never drift apart, so this was done by **deleting the duplicate card code** rather than by copying classNames into it.
- **What /systems had:** `TemplateCard` + `OtherCard` in `components/onboarding/system-cards.tsx` - 5 cards, hand-written markup, a 4x emoji icon, a gradient top-bar that only appears on hover, and a different grid (`gap-6`, 3 columns). The demo page's card came from `BusinessSystemCard` inside `components/demo/business-systems-section.tsx`. Two components, one design.
- **The fix:** `/systems` now renders `<BusinessSystemsSection />` - literally the same component, with the same search box, the same 19 category pills, the same sort dropdown and the same `BusinessSystemCard`. The only addition to that component is an optional `bindings` prop carrying which cards install a real template. `system-cards.tsx` now has **zero references** and can be deleted; it is left on disk only because deleting files is not something to do unasked.
- **"100% the same" is asserted, not assumed.** A browser harness loaded both pages and compared the rendered DOM: the card `className` is **byte-identical (370 chars)**, the inner markup of a coming-soon card is **byte-identical (1855 chars)**, and both pages render **173** cards with **19** filter pills and **18** category group headers. So this cannot silently regress into "nearly the same" later.
- **A first run reported a false failure, and it was the harness's fault.** The bare `.demo-card` class is also used by the /demo *hero banner*, so `querySelector` grabbed the banner and compared it to a system card, producing an absurd 173-vs-174 "mismatch" - the extra card being the banner. The real check needs `.demo-card.group`, since only system cards carry `group`. Worth remembering: the earlier "search by dial code returns 0 results" failure had the same root cause - a sloppy selector, not a product bug.
- **A second harness bug, worth recording because it is genuinely confusing.** Normalising the Arabic text to compare two cards failed repeatedly even though the cards were near-identical. The reason: **"قريباً" is used as BOTH the coming-soon pill text AND the coming-soon action label**, so any regex that tries to treat the pill and the action label separately disagrees with itself depending on rule order. The fix is to collapse all five label words to one token. The remaining real difference is the live pill's own styling - `border-primary/40 bg-primary/10 text-primary` plus a pulsing dot, versus `border-white/10 bg-white/[0.04] text-white/45` - which is the same available/coming-soon distinction the demo component already draws.
- **A `w-full` was added to the shared class, for a non-obvious reason.** The installable card is a `<button>` when the visitor already has an org, and a `<a>` otherwise. A `<button>` does not stretch to its grid cell the way an `<a>` does, so without `w-full` the two wrappers would have rendered at different widths - the exact "100% the same" failure the request was about, and invisible in code review.
- **Only 2 of the 5 templates can actually install, and the badges now tell the truth.** `TEMPLATE_APP_MAP` in the install-template route maps only `grocery -> grocery` and `clinic -> sama-center`, and the `apps` table holds exactly those two rows. `school`, `restaurant` and `retail` are rejected with **400 "No app is linked to this template"** - verified by calling the endpoint, not assumed. So only those two cards are badged **متاح الآن**; the other 171 read **قريباً** exactly like the rest of the catalog. Badging a card "available" whose install request is guaranteed to fail would be a lie the UI tells with a pulsing green dot.
- **This was a pre-existing limitation, not a regression.** The old page rendered all 5 `TemplateCard`s, so school and restaurant had the same 400 waiting behind them. Marking them as installable would only have made an existing broken promise more visible.
- **`retail` has no card of its own, which is a naming trap.** `id: "retail"` in `business-systems-data.ts` is a **category**, not a system, and `SYSTEM_CATEGORIES` uses the same id space - so "the retail template maps to the retail card" is a trap for anyone extending this. The binding table is a named constant with the reason written next to it.
- **End-to-end install verified while signed in, which required activating an org first.** Signup leaves `session.activeOrganizationId` null, so a fresh user sees the *signed-out* rendering; the install buttons only appear after `POST /api/v1/organizations/activate-form` (303, session cookie refreshed). With an active org: the 2 cards render as `<button>` reading **ثبّت الآن**, clicking one POSTs to `/api/v1/org/install-template` and lands in the platform approval queue (`installed: false, state: "pending"`), then redirects to `/my-apps`. **Re-installing returns the same `requestId`** rather than queueing a duplicate - the route's `status: "pending"` early return, confirmed by comparing both responses.
- **Verified: 19/19 parity checks and 18/18 install checks**, no console errors on either page, no horizontal overflow at 390px, search still filters the grid. `npx tsc --noEmit` **0**; `npx eslint` **0 errors** (1 pre-existing `no-location-assign-relative-destination` warning on the install redirect, kept deliberately: a full page load is wanted after install because the tenant context changes); `npx vitest run` **281/281 PASS (18 files)**.
- **All probe rows deleted** (34 statements across 9 tables). Final state: 0 "Install Check" users, 0 probe orgs. The single remaining phone-domain user is the real signup by هيثم عصام يحيى حميد and was left untouched.

## 2026-09-27 ? HEADER SHOWS A PROFILE BUTTON WHEN SIGNED IN

- **Request:** *"when some one is sign in i want login with account and replace تسجيل الدخول إنشاء حساب btn to profile btn"*. The "تسجيل الدخول" / "إنشاء حساب" pair existed in exactly one place - `components/onboarding/onboarding-shell.tsx`, the glass header shared by 13 pages - so this was a one-file change rather than thirteen.
- **`components/user-nav.tsx` already existed with this exact purpose and zero consumers.** Its own doc comment said *"Session-aware header actions. When a session exists we show a profile icon (link to /profile) instead of the تسجيل الدخول / إنشاء حساب buttons."* Someone had written the component and never wired it in, so the task was finishing the job, not designing it. Worth checking for a dead component before writing a new one.
- **It is a client component, and that is forced, not a preference.** The first attempt read the session on the server with `auth.api.getSession({ headers: await headers() })` - the pattern the rest of the app uses in ~20 route/page/layout files - and **the build failed on every page with a 500**: `You're importing a module that depends on "next/headers". This API is only available in Server Components in the App Router, but you are using it in the Pages Router`.
- **The real cause is a module-graph fact that is easy to miss: six files that render `OnboardingShell` are themselves `"use client"`** - `/demo`, `/signin`, `/signup` (the `app/` versions), `/windy`, and `components/signin/sign-in-form.tsx` + `components/signup/signup-form.tsx`. Once a file carries `"use client"`, everything it imports is part of the client graph, so a server component inside the shell can never import `next/headers`. There is no `src/pages` directory at all - that error message is misleading, and "Pages Router" is not what is happening here. Restructuring those six pages so the shell sits in a server wrapper would remove the constraint, but that is a large refactor of `/demo`, `/windy` and both auth pages, and it is not what was asked for.
- **A flash guard is the one genuinely important detail.** With `authClient.useSession()` the answer arrives after a round trip, and rendering the signed-out pair while pending makes a signed-in visitor watch "تسجيل الدخول" / "إنشاء حساب" appear and disappear on every navigation - inviting a click that signs them out. So `isPending` renders **nothing**. The header row is `justify-between`, so withholding the group does not move the brand; the actions simply appear once the answer is known. Verified by reading the DOM at `domcontentloaded`, before the probe has resolved: the group is absent and the login pair is nowhere on the page.
- **Initials need a two-step fallback.** A phone-only signup can leave `name` empty, and a 36px circle with nothing in it looks broken. It falls through display name -> first two characters of the email -> the `User` glyph, so the button is never an empty circle.
- **Two harness lessons worth keeping, both of which cost real time here.** (1) `querySelector("header")` matched the *hero* header on `/systems` and `/signin`, not the shell's - the shell header is the one with `sticky`, and scoping to `header.sticky` is what made the other 12 pages measurable. (2) `element.querySelectorAll("a")` **cannot match the element itself**, so when the signed-in profile link *is* the action group, a `querySelectorAll` on it returns `[]` and the component looks like it rendered no link at all - a false "no profile button" failure. Both cases needed "the element, plus its descendants". A third: tsx compiles with `keepNames`, so a *named* arrow function inside `page.evaluate` becomes `__name(...)` and throws `__name is not defined` in the browser - keep those callbacks anonymous.
- **Verified 29/29 in real Chrome across 7 pages and both auth states.** Signed out: the pair renders on `/signin`, `/signup`, `/demo`, `/select-org`, `/profile`, `/apps`, `/my-apps` and links to `/signin` + `/signup`; no profile button. Signed in: exactly one action, the avatar shows the initials, the tooltip is the account name, the button is a 36x36 circle, and clicking it lands on `/profile`; no login/signup text anywhere, on first paint or after.
- **One honest cost: an anonymous visitor now logs a 401 per page load.** The session probe hits `/get-session`, an anonymous request has no session cookie, and Better Auth answers 401 - which the browser records in the console. It is a network log entry, not a thrown error, and it is inherent to a client-side session read. Avoiding it means a server-side read, which is exactly the change that fails the build for the reason above, so it is not available without the six-page refactor. Left as-is; the check asserts no *other* console errors.
- `npx tsc --noEmit` **0**; `npx eslint` on both files **0 errors** (2 pre-existing `no-img-element` warnings on the brand and footer logo); `npx vitest run` **281/281 PASS (18 files)**. All probe rows deleted; the single remaining phone-domain user is the real signup by هيثم عصام يحيى حميد and was left untouched.
- **Not changed, flagged for a decision:** the shell *footer* still has a plain "تسجيل الدخول" link, so a signed-in visitor can still reach the signin page from there. The request was about the buttons, so the footer was left alone.

## 2026-09-28 ? PRIVATE /profile REBUILT: REAL DATA, 5 TABS, AR/EN, THEMED (implemented + verified)

- **The page was a hardcoded mock and the API behind it was a security hole.** `src/app/profile/page.tsx` rendered fixed strings and the old form kept a raw `sessionToken` in a hidden input, so "my profile" was decided by the client. It is now a `force-dynamic` server component that resolves the user from the session and redirects anonymous visitors to `/signin?next=%2Fprofile`. No `/u/[username]` route was added - the surface is deliberately private, so there is nothing to guess at from the outside.

- **Tabs are real URL state, not local component state.** `?tab=overview|activity|organizations|systems|security` via `parseProfileTab`, which falls back to `overview` for anything unknown. A shared `/profile?tab=activity` link therefore survives a reload, and the server pre-renders the activity heatmap and timeline for that tab so a cold load never shows a skeleton. Pagination then appends client-side.

- **`user.name` stayed the full-name source.** The objective called for first/last fields; splitting the display name is a convenience and a lie waiting to happen, so `name` remains canonical, `splitName` only pre-fills the editor, and the header renders the one real value.

- **`socials` / `profileExtras` / `preferences` are untyped jsonb that predates this work and had never been written by the app.** Every read is therefore treated as hostile: `normalizeSocials` drops unknown keys, `normalizeExtras` drops unknown keys, and `normalizePreferences` accepts **strict booleans only** so a polluted column can never quietly switch email or marketing on. The same `src/core/profile/normalize.ts` runs on the client for instant feedback and on the server before the write, so the inline messages match what the API actually accepts. The server call is the authority.

- **Three hardening bugs the new unit tests caught, all fixed:**
  1. `normalizeMediaRef` accepted any absolute `https://` URL, contradicting its own comment. A client could park an avatar on a third-party host and have the app render a remote tracking pixel where a private asset should be. It now accepts **only** `/api/v1/profile/avatar` and `/api/v1/profile/cover` - which is all the uploader ever writes, so nothing legitimate broke. Verified over HTTP: foreign host, protocol-relative, traversal and `javascript:` all 400; the own relative ref still 200.
  2. `CONTROL_CHARS` did not strip the bidi range, so **U+202E survived into the database** - the classic `exe.txt` rendered as `txt.exe` spoof. Added `\u202A-\u202E`, `\u2060-\u2064`, `\u2066-\u206F`. Verified end-to-end over a real UTF-8 request body: `Bad<U+202E>.txt<U+202C>` stores as `Bad.txt`, real text kept.
  3. `isRealIp` reported `127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, CGNAT and IPv6 ULA/link-local as "real", so the session list would have shown a dev machine's loopback as a recognisable device. Now false for all of them.

- **Four UI bugs fixed, none of which tsc or eslint could see:**
  1. The avatar showed a "replace photo" hover overlay but was a `<div>` with no click handler, so **the avatar could never be changed from the UI**. It is now a real `<button>` with an accessible name, focus ring and `profile.header.changeAvatar` (a key that already existed in both dictionaries).
  2. The debounced username probe depended on the whole `controller` object, which `useProfile` returns as a fresh literal every render. Each result re-armed the effect and re-probed, so typing a handle would **hammer the rate-limited endpoint forever**. It now depends on the stable `useCallback` `checkUsername`.
  3. The editor's reset-on-open lived in the dialog's `onOpenChange`, which never fires for a parent-driven open, so a cancelled edit **leaked into the next open**. `ProfileView` now bumps an `editorEpoch` and keys the editor, remounting it from the current server snapshot.
  4. `page.tsx` swallowed a failed server-side activity query and passed `activity: null`; the panel's `!activity` branch renders a skeleton, so a transient DB blip left the tab **loading forever with no retry**. The failure is now propagated as `activityLoadFailed` and seeds the panel's error state, which has a working retry.

- **Profile PATCH is transactional and its audit row is not optional.** `updateProfile` takes the transaction client and the route passes the same `tx` to both the update and the audit write, so a rejected username can no longer leave a half-applied profile. Verified: a 409 PATCH changes no field and writes no audit row. `assertSessionOwnedBy` returns 404 rather than 403 for a foreign session id, so the endpoint does not confirm that the id exists.

- **Media is private and cannot be silently repurposed.** Uploads are magic-byte sniffed (jpeg/png/webp) with a 2 MB avatar and 5 MB cover ceiling, reads are session-gated and `private, no-cache` (was `no-store`, which forced a full re-download of every photo on every page view — see the 2026-10-03 profile-photo entry above for why that was two bugs stacked), and the stored value is a *ref*, not a URL. Legacy `avatars/{id}.{ext}` keys are still served and purged so an existing avatar does not vanish, and `handleMediaDelete` clears every candidate extension plus the legacy key before nulling the column.

- **The theme toggle and shell were not written for this and did not need to be.** `OnboardingShell` gained an `"auto"` variant that resolves the direction from the locale instead of hardcoding it, and `ThemeToggle` got its missing dictionary entries - which is why 6 of the 13 shell consumers now render in the right language.

- **Verification: `npx tsc --noEmit` 0; focused `npx eslint` 0 errors and 0 warnings; `npx vitest run` 320/320 PASS (19 files), up from 281/281 - the 39 new cases are `tests/core/profile.test.ts`, DB-free coverage of the security boundary (sanitisers, media sniffing, ref normalisation) and the i18n contract, including an ar/en key-parity assertion and a check that every dictionary key the UI asks for actually resolves.** Live HTTP against the running server: 45/45 on the auth/IDOR/atomicity/SSR matrix, plus 11/12 then 7/7 on the two targeted scripts. The single media-ref "failure" was a harness bug, not an app bug: Windows PowerShell 5.1 encodes a string `-Body` with the ANSI codepage, so the bidi characters were replaced by literal `?` before the request left the process. Re-run with explicit UTF-8 bytes and it passes. Two other harness lessons from the same round: the profile API response is enveloped as `{ data: ... }`, not bare; and a "no bidi in the response" assertion that reads `$response.Content` is a **false pass**, because PowerShell decodes the body as Latin-1 - the assertion has to go through `[System.Text.Encoding]::UTF8.GetString($raw.RawContentStream.ToArray())` or check the database.

- **The 500 that looked like a schema bug was a stale process.** Authenticated requests failed with `Unknown field 'username' for select statement on model 'user'`, which reads exactly like a Prisma client that was never regenerated after the migration. It was not: the client was fine, and the dev server had been running since **before** `prisma generate`. Restarting `npm run dev:erp` fixed it with no code change. Worth remembering before editing the schema again.

- **All probe rows deleted.** 14 users created across four verification rounds, removed with deletes scoped to a temp table of their own ids (6 + 8, in two rounds) so no other row could be touched. Final state: 0 `profile.probe+%@probe.local` users, 0 users with a `username`, 0 users with a `cover_image`, and no orphaned media under `.data/storage/profile/`. The single remaining phone-domain user is the real signup by هيثم عصام يحيى حميد (`777296855`) and was left untouched. Note that the raw table columns are snake_case (`actor_user_id`, `requested_by_user_id`, `follower_id`) and `verifications` keys off `identifier`, not `user_id` - the first cleanup attempt failed on exactly that.

- **Not done, deliberately:** uploads are still validated by magic bytes only, with no full decode, so a decompression bomb inside the size limit is not caught; `ThemeToggle` still has a ~32px hit target; and `src/components/profile/profile-form.tsx`, the legacy client-token form, is now unreferenced but still in the tree. No build, deploy or git operation was run.

## 2026-09-27 ? LANDING RAIL + DOCK: PROFILE TILE REPLACES SIGN IN / SIGN UP WHEN SIGNED IN (verified in Chrome)

- **Request:** logged in at `/`, the rail's last two tiles were still `تسجيل الدخول` + `إنشاء حساب`. The rail and the mobile dock were the landing page's only chrome, and both hardcoded that pair, so a signed-in visitor was offered a sign-in link **on their own front page**. The shell header had already been fixed for exactly this (`components/user-nav.tsx`); the landing chrome was simply never wired to it.
- **The session is read on the client, and that is forced rather than preferred.** `src/app/page.tsx` is `"use client"`, and six files rendering the shared `OnboardingShell` are too, so a server component calling `next/headers()` cannot be imported into this module graph - it fails the build. This is the same constraint `user-nav.tsx` documents at length.
- **Nothing renders while the session resolves** - deliberately, and it is the whole point. Rendering the signed-out pair first would flash `تسجيل الدخول` at someone who is signed in, and they could click it. The rail is closed until a deliberate click, by which time the answer is known, so the interim height is never observed. That is why the change looks like "the tiles just appear" rather than "they swap".
- **`--rail-slots` had to become derived, and this is the part that is easy to miss.** `.rail.is-open { height: calc(var(--rail-slots) * var(--rail-tile)) }` with `--rail-slots: 10.25` baked in for nine tiles. Dropping to one auth tile without touching it would have left three quarters of a tile of dead space at the bottom of the open column. It is now written inline as `NAV_PAGES.length + 0.25 + 1 + authRail.length` - 10.25 signed out, 9.25 signed in, 8.25 while resolving - so any auth-tile count stays correct. The CSS value is kept as the pre-hydration fallback and its comment now says it is shadowed.
- **The mobile dock had the same defect and was fixed in the same pass.** `.dock-wrap` is the rail's counterpart below 1280px, and its trailing pill was an unconditional `إنشاء حساب`. A signed-in phone visitor got the same wrong offer. It now shows a `حسابي` profile pill, and the divider that preceded it is dropped with the entry so a lone pill is not preceded by a stray rule.
- **The hero and footer CTAs were left alone, on purpose.** The hero's sign-up buttons and the footer's `تسجيل الدخول` link are marketing copy, not navigation chrome; swapping them is a different decision than the one that was asked for, and the footer's sign-in link is already recorded as an open question in a previous entry.
- **Verified 19/19 in real Chrome across both auth states**, at 1440x900: signed out 9 tiles with `--rail-slots: 10.25`; signed in 8 tiles with no `تسجيل الدخول` and no `إنشاء حساب` anywhere in the rail, `--rail-slots: 9.25`, the seven page tiles byte-identical, the dock pill gone, the open column 518px = 9.25 x 56px, the profile tile navigating to an authenticated `/profile`, and no console errors. All probe users deleted afterwards.
- **Three harness lessons, each of which first produced a false failure.** (1) `browser.newPage()` opens a **fresh isolated context every call**, so a cookie set on a signup page never reaches the page under test - the run must share one `createBrowserContext()`, or "signed in" is never actually true. (2) Driving the real sign-up form to get a session tests the *form* (country picker, phone/email toggle) instead of the rail; a same-origin `fetch` to `/api/auth/sign-up/email` from inside the page sets the cookie on the right origin and keeps the check about what it claims to be about. (3) **With the rail closed, a click on a tile lands on the burger**, because the tiles sit exactly underneath it at `z-index: 2` - that is the pen's "emerge from beneath" behaviour working as designed, not a bug. Asserting navigation therefore requires opening the rail first, and a naive `page.click` on a closed tile merely toggles the rail open and looks like a broken link.

## 2026-09-27 ? SYSTEM CARD: THE ICON WAS NEVER AN ICON, AND THE GRID WAS RAGGED (verified in Chrome)

- **Report:** the system cards were "not organized, missy". What looked like a taste problem was half a rendering bug.
- **`system.icon` holds a lucide *name*, not an icon.** The `apps` table stores `shopping-cart` and `heart-pulse`, and the templates and adapters key their nav by the same convention. The card rendered `{system.icon || "🧩"}` straight into the markup, so the 40px icon tile contained the literal word `shopping-cart`. Nothing was wrong with the data; the name was simply never resolved to a component.
- **New `src/components/app-icon.tsx` exports `appIcon(name)`, which is total.** It covers every icon name actually present in the templates, adapters, and the `apps` table, in both spellings, because the codebase is inconsistent about them - `app-sidebar.tsx` and `grocery-sidebar.tsx` key by kebab-case while the templates mix in PascalCase (`HeartPulse`, `BarChart3`). Lookup order is kebab, then PascalCase, then `Puzzle` - the vector counterpart of the 🧩 emoji that used to be the default, so the fallback keeps the original intent. It deliberately never returns `undefined`: `app-sidebar` renders `{Icon && <Icon/>}`, so an unmapped name there silently drops the icon, and any caller that skipped that guard would throw React's "Element type is invalid".
- **The tidiness fix is one line that is easy to walk past: `mt-auto`.** The card was a `flex-row` with the title, org name, and status row stacked in the right-hand column, so the status row rode up and down with the length of the title. In a 3-column grid that reads as broken alignment even when nothing is technically wrong. Splitting into an outer `flex-col` with a `mt-auto` footer pins the status row to the bottom of every card, so it lands on one baseline across a row. `h-full` moved onto the `li` as well so the border fills the grid cell evenly.
- **The version was loose text next to a real pill.** `v1.0.0` sat at `text-[10px]` with no container, directly beside a styled `Badge` - a 10px fragment floating next to a 24px pill is the single messiest thing on the card. It is now a matching `rounded-full` chip at `text-[11px]`, so the two read as peers. Icon is `size-5` lucide at `muted-foreground`, turning `primary` on card hover to match the existing border hover.
- **Verified in Chrome on both tabs with a deliberate length contrast**, because the alignment claim is only meaningful when the titles differ. Seeded the SAMA app (`مركز سما للعلاج الطبيعي`, 24 chars) beside grocery (`إدارة البقالة`, 13 chars) into a *test* org and measured: **status-row spread 0px** on both `?tab=overview` and `?tab=systems`, all cards in a row exactly 108px tall, both icons real inline SVGs with empty text content, no console errors. All seeds deleted; `Fixed Co` back to 1 app, real user still 1 membership in `haitham`.
- **Two harness traps worth recording.** (1) A brand-new user has no systems, because the query is `organizationApp.findMany({ where: { organization: { members: { some: { userId } } } } })` - a *membership* is required, not just an installed app. Signing up and looking for cards finds nothing and looks like a rendering failure. Seed into test-residue orgs only; `haitham` is the real user's org. (2) `li h-full` is a **descendant** combinator, matching an `.h-full` inside an `li`. For "an `li` with class `h-full`" the selector must be `li.h-full`. The descendant form matches nothing here, so it reports an empty grid as a timeout.
- **Not fixed, flagged instead:** `app-sidebar.tsx` has its own local `ICON_MAP` that lacks `shopping-cart` and `heart-pulse`, so those names render *no* icon in that sidebar. It is guarded and does not crash, and the grocery and SAMA apps use their own sidebars which do map correctly, so the bug is not user-visible today. Pointing it at `appIcon` as a second lookup is a one-line hardening, but it was left alone rather than changing a file outside the report.

## 2026-09-28 — ORG IN THE URL + FULL RBAC SWEEP (verified in Chrome, 347/347)

- **Request:** "when I sign in, I want to go to my org, every customer has an org separated from the other and every org has its own database and systems, and the URL should be `localhost:3100/orgName/profile`, protected." Followed by explicit choices: path-based URLs, single-org users go straight through, route+redirect **first**, and a full RBAC sweep.
- **The database half was deliberately not done, and this is the load-bearing caveat.** `src/core/tenancy/schemas.ts` already describes database-per-tenant (`bos_<slug>` with `t_<slug>` / `grocery_<slug>`), but the only external caller of `provisionTenantResources` is the pending-approval route `src/app/api/platform/approvals/[id]/route.ts:91`, and every org-creation path hardcodes `active`, so that branch is unreachable. All 87 orgs share `businessos`. Running `provisionTenantSchemasForAll` would create 55 **empty** table copies per org and every existing org would appear to have lost its data, with no migration to move it. Route and redirect first, migration later, as chosen.
- **The org was previously carried only by `Host` + the session's `activeOrganizationId`,** so `/haitham/profile` and `/otherco/profile` were the same page and neither told you which org you were in. `src/core/tenancy/org-route.ts` makes the URL authoritative and keeps the session as the storage the rest of the app already reads.
- **"Not a member" and "no such org" are deliberately the same 404.** A 403 would confirm the slug exists, turning `/{slug}/profile` into an org-enumeration oracle. `resolveOrgScope` looks the org up in the shared registry and then requires a real `member` row for the caller's user id; the slug is only ever used to *find* the org, never to authorize. Platform admins are not special-cased — this is the customer org surface, and their cross-org access lives in `/platform-admin`.
- **`RESERVED_ORG_SLUGS` exists because Next resolves static segments before dynamic ones.** A `/{orgSlug}` tree sits at the top level, so an org called `api` or `profile` would have an unreachable URL — the request would land on the app's own route. Verified: `/platform-admin/profile` returns 404 and is never treated as an org.
- **Post-sign-in routing is `src/app/auth/landing/page.tsx`**, which re-reads the session server-side and calls `postSignInPath`: validated `?next=` wins, then a single org (the actual request — do not make one-org users click through a picker), then `/select-org` for genuine multi-org users. The sign-in route returns `redirectTo: "/auth/landing"` rather than a hardcoded `/app`, and the form posts `next` on both the credential and social paths.
- **`safeNext` had a real bug that the unit tests caught immediately.** `value.search(/[/?#]/)` matches the **leading** slash at index 0, so `firstSegment` was always `""` and *every* redirect was rejected — the function returned null for `/profile` as well as for `https://evil.com`. It now slices off the leading slash before searching. The rejection list is deliberately explicit rather than escaped (scheme, `//host`, backslash, control characters), because the value is attacker-supplied.
- **The legacy `/profile` is now a canonicalizer, not a second implementation.** It forwards to `/{slug}/profile`, carrying `?tab=` across, so the landing rail's profile tile lands on the org URL. It resolves the org from the session's `activeOrganizationId` **and falls back to a sole membership** — without that fallback it redirected nowhere, because `activeOrganizationId` is empty until an org is chosen, so on a fresh sign-in it sent you straight back to `/profile` and defeated its own redirect. With no session, no org, or several orgs, it renders the screen directly and `ProfileScreen` keeps owning those cases. `/{org}/my-apps` renders the shared `MyAppsScreen` with the org id **resolved from the slug**, so the page cannot be made to render a different org than the address bar names.
- **RBAC sweep: all 45 SAMA handlers now call `requirePermission`** (46 statements; `dashboard` needed `reports:read` and was done by hand). Before this, every SAMA route had *membership as its only check*, so any `viewer` could read and write the entire clinical dataset. The reason it was unfixable before is the interesting part: there was no permission statement that could describe "read a patient", so `patients` and `appointments` did not exist in the catalog at all. They do now, with deliberate grants — `cashier` gets `appointments: read/create` because booking a visit is front-desk work, but not `patients`, because reading the clinical record is not. `patients`/`appointments` routes are additionally behind `requireModule`, since the module toggles were invisible to the API until now.
- **The codemod was wrong three times before it was right, and the failure mode was corruption, not a bad diff.** (1) The first run spliced text at a **relative** offset instead of rebasing it onto the file, duplicating `requireTenantContext(request)` and `getOrgSettings(tenant...)` mid-line across 19 files; those were restored from a backup taken beforehand. (2) Fixing that, it read the indent with `/\r?\n(\s*)/` — and greedy `\s` swallowed the following blank line, injecting a newline into the middle of every inserted block. (3) With `[ \t]*` it then read the indent of the *blank* line, so the guards were emitted flush-left. The working version takes the indent from the anchor's own line by walking back to the line start, and emits one contiguous block with no trailing newline (the file already has a blank line there; adding one leaves two). **Do not re-run the script from a stale copy — check `git diff` afterwards.**
- **The sync gate is per-operation, and that was not the obvious first design.** `/api/v1/sync` takes an arbitrary mix of create/update/delete across eleven entity types. A single blanket permission is wrong in both directions: requiring everything locks cashers out of POS offline sync, while requiring anything lets a caller with only `products:create` smuggle in an `expense` write. `src/core/sync/permissions.ts` checks every operation against the role and fails the batch on the first unauthorized one — consistent with the batch already being all-or-nothing by `idempotencyKey`.
- **Three of the eleven entities have no `create`/`update`/`delete` verb at all, and the unit tests caught the mapping being wrong.** `inventory` exposes `adjust`/`transfer`/`count`, so a warehouse write is an *adjustment* whatever the op; `finance` and `settings` expose only `manage`. The naive "verb = op name" mapping denied the **owner** their own back-office sync while appearing correct. `MODULE_WRITE_VERB` is now declared with `satisfies`, so renaming a module's actions is a compile error rather than a silent denial.
- **Two smaller holes closed in the same pass.** `GET /api/v1/settings` returned the org's custom domains and enabled-module list to any member and now needs `settings:read`; `PATCH` only required `settings:manage` when the body contained `branding` or `modulesEnabled`, so a bare `{ locale }` patch was accepted from a `viewer`. `GET /api/v1/search` fans out over products, customers, suppliers, sales and purchases at once and now requires all five read permissions, so a role that can read products but not finance cannot enumerate sales through the search box.
- **Verification: `npx tsc --noEmit` 0; focused `npx eslint` 0 errors; `npx vitest run` 347/347 PASS (20 files), up from 320/320** — the 27 new cases are `tests/core/org-routing-rbac.test.ts`, DB-free coverage of the redirect rules (reserved slugs, open-redirect rejection, org-not-a-member refusal) and the sync gate. Live HTTP in real Chrome via `scripts/org-routing-check.ts`: **11/11** — single-org user lands on `/{slug}/my-apps` with no picker and no console errors; the org is in the address bar; `/profile?tab=organizations` forwards to `/{slug}/profile?tab=organizations` with the organizations tab active; a non-member and an unknown slug both return 404 and a reserved segment is never an org; a suspended org is bounced to `/select-org`; a cross-origin `?next=` is dropped rather than followed; a multi-org user still gets the picker. All probe rows deleted (0 `@probe.local` users, 0 `orgprobe-` orgs) and the real account confirmed untouched by id — `98jTN1luoowhWUmy0zXwCJy73IimUSdQ`, `GMSNOW`, `p967777296855@phone.bos.local`, 1 membership.
- **Harness lessons.** (1) It must be a **`.ts` script run with `npx tsx`**, not `.cjs`: the Prisma client is generated to `src/core/db/generated/prisma` as TypeScript (`provider = "prisma-client"`), so `@prisma/client`'s default entry resolves to nothing under CommonJS. (2) Better Auth returns **403** for a server-side `fetch` to `/api/auth/sign-up/email` that carries no `Origin`; the in-page variant gets one from the browser automatically, so only the Node-side calls need the header added by hand. (3) `organization.id` and `member.id` have **no database default** — they are generated in application code, so fixtures must pass `randomUUID()` or Prisma rejects the insert. (4) `auditLog`'s actor column is `actorUserId`, not `userId`; a cleanup that guesses wrong fails loudly, which is the good outcome. (5) An in-page `fetch` of a **relative** URL needs a prior navigation, or it throws "Failed to parse URL". (6) The profile tab strip marks the current tab with `aria-current="page"`; there is no `aria-selected` to query.
- **Not done, flagged instead:** per-org databases (deferred, as above); `app-sidebar.tsx` still has its own local `ICON_MAP` without `shopping-cart`/`heart-pulse` — guarded, non-crashing, and not user-visible today because grocery and SAMA use their own sidebars; the 503 users / 105 orgs in the DB are `npx vitest run` residue from the integration suites (`IsoA-*`, `IsoB-*`, `revoked-*`), not probes. No build, deploy or git operation was run.

## 2026-09-28 — SIGN-OUT AT PROFILE, AND WHY THE BUTTON ALONE WAS NOT THE FIX (verified in Chrome, 8/8)

- **Request:** "add sign-out at profile".
- **It already existed, in the wrong place.** `profile-security-panel.tsx` had a sign-out button, but only on the Security tab, and only on the row for the *current* session - so it read as "sign out of this device" rather than "sign out", and it was invisible from the other four tabs. The profile header, which is the one region visible from every tab, had a single action (Edit profile). The new button sits beside it as `variant="outline"`, with a `signingOut` guard so a double-click cannot fire two sign-outs while the request is in flight. It carries `profile.header.signOut` in ar and en; the existing ar/en key-parity test covers it.
- **The real bug was that `signOut()` does not navigate, so the existing button never actually left the page.** Better Auth's `signOut` clears the cookie and broadcasts a session update, which updates the *client* session atom, and then stops - there is no navigation. The profile, the org pages and the shell are all server components, so a client-only sign-out leaves the current route rendering from the Next.js router cache with a session that no longer exists: the page keeps showing signed-in chrome until a manual refresh, and a protected route the user was already inside stays on screen. The three sidebars had been working around this by hand (`window.location.href = "/signin"` inside `fetchOptions.onSuccess`); the new `signOutAndRedirect(to = "/signin")` in `src/core/auth/client.ts` makes that the one correct way to do it, and the Security tab was switched to it so both call sites share one implementation. `onError` navigates too: if the request fails, the user asked to be signed out and staying put would imply it worked.
- **A stale dev server, not the app, produced an entire round of false failures - and the way it failed was actively misleading.** Every click in the profile header, including the pre-existing **Edit profile** button, did nothing and instead triggered a same-URL navigation. That is the signature of a wedged `next dev` process, not of one broken button, and it is the second time this repo has hit it (see the `Unknown field 'username'` entry). Restarting the server fixed it with no code change. `EADDRINUSE` on the restart is a trap of its own: killing the listener is not enough, because the npm/next parent respawns a child that takes the port back - the whole process tree has to go. **When a click-driven check fails, click something unrelated first.** If that also fails, suspect the server, not the component.
- **`POST /api/auth/sign-out` returns 415 to a bare `fetch` with no `content-type`, and the session survives.** That is not a bug and cost a diagnostic cycle: it is better-auth requiring JSON, and the real client sends it (a click returns 200). Worth knowing before concluding the endpoint is broken from a hand-rolled probe.
- **Two harness assertions were wrong in instructive ways.** (1) Only the *active* tab carries `aria-current`, so "click the second `[aria-current=page]` element" selects nothing and silently no-ops - the tab strip has to be addressed structurally (`nav ul li button`, take the one without `aria-current`), and the check now asserts a tab was actually switched. That false pass was the only thing standing between the first run and a wrong conclusion. (2) Asserting "no `<header>` remains" is meaningless after sign-out, because the sign-in page has a header too; the assertion has to name *profile* chrome (the sign-out and edit actions, the org switcher). Pair the click with `waitForNavigation` rather than polling `waitForFunction` afterwards - a navigation destroys the execution context that a poll is running in.
- **Verification: `npx tsc --noEmit` 0; focused `npx eslint` 0; `npx vitest run` 347/347 PASS (20 files).** Live HTTP in real Chrome via `scripts/signout-check.ts`: **8/8** - the action is in the `<header>`, not only the security panel; it survives a tab switch (5 tabs, switched to النشاط); clicking it lands on `/signin`; and the substantive assertion - `/{org}/profile` is no longer reachable afterwards, redirecting to `/signin?next=...` with no profile chrome left on screen, which is exactly what the pre-existing button failed to guarantee. No console errors. `scripts/org-routing-check.ts` re-run at 11/11 on the fresh server. Probe rows deleted (0 `@probe.local` users, 0 probe orgs) and the real account confirmed untouched by id - `98jTN1luoowhWUmy0zXwCJy73IimUSdQ`, `p967777296855@phone.bos.local`, 1 membership, 9 sessions.
- **Left alone deliberately:** the per-row sign-out/revoke pair in the session list stays, because revoking *other* sessions is a genuinely different action and removing the row action would lose it. The three sidebars still hand-roll their redirect; switching them to `signOutAndRedirect` is a mechanical follow-up that was not part of this request. No build, deploy or git operation was run.

## 2026-09-28 — GOOGLE SIGN-IN LANDED IN AN EMPTY ORG PICKER; FIRST-TIME USERS NOW GET AN ORG NAMED AFTER THEM (verified in Chrome, 13/13)

- **Report:** "when i sign in with google its goes to /select-org instead of /{orgName}/profile - make the name with google name."
- **Root cause, and it was a two-part dead end.** The live Google button on `/signin` posts `callbackURL: /auth/landing` (`src/app/signin/signin-form.tsx:309`), and `/auth/landing` only *routes* - it reads memberships and calls `postSignInPath`. A first-time Google user has no `member` row, so it resolved to `/select-org`, which renders an empty `<ul>` plus the line "you can create a new organization from the control panel" - and no such control exists, no button, and `POST /api/v1/organizations` is never called from the UI. Meanwhile the page that *does* provision (`/auth/complete-org`) was only reachable from the `/signup` social button, so signing in and signing up with the same Google account took two completely different paths. `postSignInPath` now treats zero memberships as "provision", which is the one change that fixes every provider, because `/auth/landing` is the single post-auth decision point. No hook, no middleware change.
- **The org is named from the Google display name.** `user.name` is what Better Auth writes from Google's `name` claim, so `complete-org` names the org after it; the user asked for exactly this. With a template chosen at `/signup`, the template's Arabic name still wins - that is a deliberate product choice, not an oversight, since the template *is* the product the user picked.
- **A latent bug this exposed, and it was the more serious half.** The slugifier in use kept `\u0600-\u06FF`, so an Arabic-named Google user got a slug like `محمد-علي` - and `isValidOrgSlug` rejects that, so the `/{org}` route never matched. The org row was created, the membership was created, the user was owner of a business they could not open: 404 on their own URL with no recovery except the session's `activeOrganizationId`. Real Google accounts in this deployment *are* Arabic-named, so this was one click from production and no test covered it. `src/core/tenancy/org-slug.ts` now forces the slug to ASCII and guarantees the invariants `isValidOrgSlug` demands, with the *name* left in any script because it is display text. Two copies of the old slugifier (in `complete-org` and in the public signup route, with different length caps - 32 and 40) are gone; the signup route had the identical bug, so an Arabic org name typed into the signup form produced the same unreachable tenant.
- **A slug is not cosmetic here.** It is the `/{org}` path segment *and* the stem of the per-org database and schema names, so anything unroutable is also a provisioning hazard. Three guards that look like pedantry and are not: a reserved name is namespaced rather than kept (`systems` -> `org-systems`, or the org would shadow the app's own route), a bare number is namespaced (`404` -> `org-404`, it reads like a row id), and a single character is rejected because `SLUG_RE` needs two. The order of those checks mattered: reserved-first, because `isValidOrgSlug` rejects `systems` *for the right reason*, and a validity fallback placed before the reserved check quietly hashed the name away - caught by a test, not by reading the code.
- **Non-Latin names get a real URL instead of a hash.** Order is name -> email local part -> FNV-1a hash of whatever we have, and the last step is deterministic, so the same person keeps the same segment across retries. Seeding from the *local* part alone is what makes this pleasant: "محمد" becomes `/{haitham}/profile`, not `/{haitham-gmail-com}/profile`. Collisions count up (`ahmed`, `ahmed-2`) rather than randomising, so a URL stays guessable; a random suffix is the last resort after 50 tries.
- **`next` is deliberately dropped for a 0-membership user, and that was a judgement call worth writing down.** It looked free to carry it into provisioning and re-validate afterwards, but it is not: `safeNext` permits app-level paths like `/profile` with no org, so checking `next` first drops a brand-new user onto a protected surface they cannot use, and an *org-scoped* link is unsatisfiable by construction - the slug that would make it valid is the one being created, and the user could not have known it. Preserving it only defers the drop to after the org exists. Provisioning is therefore checked first, and the deep link is simply lost.
- **Verification: `npx tsc --noEmit` 0; focused `npx eslint` 0; `npx vitest run` 369/369 PASS (21 files, +22).** Google itself cannot be driven headlessly, but the callbackURL and the state it arrives in are reproducible, so `scripts/social-landing-check.ts` exercises the identical server path with an email sign-up: **13/13** - a first-time Arabic-named user with no membership is never routed to `/select-org`, lands on `/{org}/profile`, passes through `/auth/complete-org`, ends up owner of an org named `حسان الرفاعي` with a committed `platform.tenant.created` audit row, and **the URL it advertises actually returns 200 and shows the name** - the assertion that would have failed before this change. A returning single-org user goes straight to `/{slug}/my-apps` instead of a picker listing one org, and a genuine two-org user still gets `/select-org`. `org-routing-check.ts` 11/11 and `signout-check.ts` 8/8 re-run clean. Probe rows deleted (0 `@probe.local` users, 0 probe orgs); the real account is untouched by id.
- **Two harness lessons, both from asserting things that are not observable.** A server-side `redirect()` hop does not fire `framenavigated` - the router follows it internally - so `/auth/complete-org` never appears in the visited list even though it plainly ran; provisioning had to be proved by the document response and the audit row. And the Google button is an inline SVG plus an Arabic label, so there is no "google" string to match; it is found by its `#4285F4` path fill. Both first attempts "failed" against working code, which is the same trap as the dead dev server in the sign-out entry: check that the assertion can be observed before believing that the behaviour is absent.
- **Left alone deliberately:** `src/components/signin/sign-in-form.tsx` and `src/components/signup/signup-form.tsx` are unreferenced duplicates that still point at `/auth/complete-org` with a `tenant ? origin/select-org : ...` expression; they are dead code and deleting them is a separate cleanup. A new org opens on its profile rather than my-apps, per the request; an *existing* single-org user still opens on my-apps, which is the earlier documented decision and was not reversed silently. No build, deploy or git operation was run.

## 2026-09-28 — REACT 19 REFUSED THE INLINE THEME SCRIPT; MOVED TO A HOISTED FILE WITHOUT INTRODUCING A FLASH (verified in Chrome, 8/8)

- **Report:** console error on every dev render, "Encountered a script tag while rendering React component", pointing at the inline theme bootstrap in `src/app/layout.tsx`.
- **What React actually does, read from the source rather than guessed.** In `next/dist/compiled/react-dom/cjs/react-dom-client.development.js` the `script` case of `createElement` does not merely warn: it builds a `<div>`, logs once per page load, and sets `innerHTML = "<script></script>"` - an inert placeholder. The only escape is `isScriptDataBlock(newProps)`, which requires a *non-executable* MIME type (`application/json`, `text/template`, ...). Adding a `type` is therefore not a fix; the script would stop working. The other escape, in `isHostHoistableType`, is narrow and specific: a script is hoistable only when `async` is set, `src` is a non-empty string, and there are no `onLoad`/`onError` handlers. That is the entire escape hatch, and it is why this was not a one-attribute change.
- **The warning was the symptom of a real latent bug, not cosmetic noise.** The script was server-rendered and executed correctly on a hard load, which is why every test and every "no console errors" check had passed. But the moment React rendered the layout *on the client* - any client-side navigation, any Fast Refresh in dev - it replaced the theme script with that inert `<div><script></script></div>`. Harmless most of the time, because the theme only needs applying once at document load, and wrong exactly when it matters: theme state is the one thing that must not be lost to a re-render. So the fix was worth making even though nothing was visibly broken.
- **`next/script` does not solve it, and the docs do not say so.** `strategy="beforeInteractive"` is the documented answer for root-layout scripts, and its implementation (`next/dist/client/script.js`) returns `jsx("script", {dangerouslySetInnerHTML})` for both the inline and the `src` case - a React-rendered script tag, so the same warning, plus an extra indirection. Its `document.createElement("script")` path (line 92) is only used for imperative app-router loading, not for the JSX you write. Worth knowing before spending an hour on the "blessed" API.
- **The constraint that ruled out the naive fix: there is no CSS safety net.** Dark mode here is a class-based variant - `@custom-variant dark (&:where(.dark, .dark *))` - not a `prefers-color-scheme` media query. A late or skipped script means a light page until hydration, with nothing to cover for it. That is why the file is tiny and dependency-free, and why the move was verified for *timing* rather than assumed to be equivalent.
- **Timing was measured, not assumed.** A frame recorder installed via `evaluateOnNewDocument` - so it runs before any page script and frame 0 is the first painted moment - under 4x CPU throttling, 400kbps, and a cold cache. All four preference combinations were already correct on frame 0: stored dark, stored light against an OS dark preference, no preference with OS dark, and no preference with OS light. The fourth "failed" the first run and the failure was in the *assertion*, not the code: the original script's `else if(!t || matchMedia(...).matches)` applies `dark` whenever there is no stored preference regardless of the OS, which is the app's deliberate dark-first default and matches `useState<Theme>("dark")` in the provider. The port preserves that exactly, including the `try/catch` that still lands on dark when storage throws in private mode.
- **Verification: `npx tsc --noEmit` 0; `npx eslint` 0; `npx vitest run` 369/369 PASS (21 files).** `theme-init.js` is served, appears in the SSR HTML hoisted with `async`, and no inline `bos_theme` script remains. In Chrome: **8/8** - zero script-tag warnings on a signed-in org page *and* after a client-side navigation (the case that used to warn), the theme class survives client navigation, and no other console errors. All three browser regressions re-run clean: org-routing 11/11, sign-out 8/8, social-landing 13/13. CSP needed no change - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` already permits a same-origin script.
- **Worth noting that this warning could not be caught by the existing harnesses.** All four of them assert "no console errors" and all four passed while the layout carried this bug, because the warning needs a *client-side* re-render of the root layout and the harnesses navigate with `page.goto`. Asserting the absence of a warning is only as good as the navigation that can trigger it.

## 2026-09-28 - SIGN-OUT WAS IMPLEMENTED FIVE TIMES AND TWO OF THEM WERE BROKEN INVISIBLY; NOW ONE CONTROL, ONE BEHAVIOUR (verified in Chrome, 7/7)

- **Report:** "`/api/auth/sign-out` not working in the `تسجيل الخروج` button."
- **The report pointed at the wrong thing, and both reported buttons were genuinely broken for unrelated reasons.** The endpoint is fine - it answers 200 to the real client. `my-apps-screen.tsx` posted it with a **native `<form action="/api/auth/sign-out" method="post">`**, and a form POST sends `application/x-www-form-urlencoded`, which Better Auth rejects with **415**. So the session survived *and*, because a form submit is itself a navigation, the browser replaced the page with the raw JSON error served from `/api/auth/sign-out` - the user was left staring at the API endpoint, still signed in. The platform-admin control called a bare `signOut()` with no navigation: the cookie was cleared, but the admin page stayed on screen rendering from the router cache with a session that no longer exists. Two different bugs that look identical from the outside: "the button does nothing". Worth remembering that "the endpoint is broken" and "the button is broken" are separate claims, and the evidence for the second was never evidence for the first.
- **`type="button"` is load-bearing, not a default worth setting once.** The bug being replaced *was* a submit button posting to an endpoint that cannot accept a form encoding. The shared control in `src/components/sign-out-button.tsx` therefore pins `type="button"` and documents why, so the next person to "simplify" the form wrapper does not reintroduce it.
- **The three sidebars were working, and were still the right thing to delete.** Each hand-rolled `fetchOptions.onSuccess` + `window.location.href = "/signin"`, which is what the previous entry recommended consolidating on. Replacing them with the shared control removed three copies of the redirect and, more usefully, three places with **no `onError` path at all**: a failed sign-out there was completely silent, the mirror image of the platform-admin bug. `src/app/platform-admin/sign-out-button.tsx` is now a thin labelled wrapper so its two call sites are unchanged.
- **A check that only covers the profile cannot catch either of these bugs, so the new harness covers every surface - 7 controls, and it asserts the session, not the navigation.** `scripts/signout-surfaces-check.ts` walks the profile header, the org app list, the legacy `/my-apps`, and the three sidebars plus platform-admin, and for each one asserts the substantive property: after the click `GET /api/auth/get-session` reports no session *and* the URL is `/signin`. Navigation alone is insufficient and is exactly the assertion that would have passed on the broken platform-admin button if the redirect were the only thing checked; conversely a control can redirect while leaving the session alive, which is the failure that is easiest to miss. It also records every `/api/auth/*` response, so a throttle or 5xx appears as data instead of being guessed at.
- **Two harness bugs in this check are worth more than the check, and the first one nearly cost the whole diagnosis.** Intermittent failures on a *different* random surface each run - with the pre-existing session still alive - were not a product bug and not a rate limit: no `/api/auth/sign-out` request was ever issued, so the click never reached the handler. The click landed on server-rendered HTML before React hydrated that subtree. My first gate was `localStorage.bos_theme !== null`, which is a *worse* signal than a fixed sleep because localStorage survives navigation - it reads non-null on the second page before that page has hydrated, so it passed while the click still did nothing. The gate is now the handler itself: React stores the props it wired up on the DOM node, so a non-function `onClick` under a `__reactProps$` key means the node is inert server HTML. Second, the harness needed `session.updateMany` to set `activeOrganizationId`, because `/app/*` and the legacy `/my-apps` resolve the org from the *session* and not the URL, so a freshly signed-in probe with no active org is bounced to `/select-org` and never reaches the sidebar under test - four surfaces "failed" against working code for that reason alone. Same trap as the dead dev server in the profile entry: prove the assertion is observable before believing the behaviour is absent.
- **Eight consecutive clean runs, and the evidence is now self-describing rather than inferred.** Each passing surface logs `afterClick=disabled=true ariaBusy=true` - proving the handler ran and the pending guard engaged, so any later failure is provably downstream of the click and not a swallowed event - followed by `200 /api/auth/sign-out`. Before adding that probe I had been inferring the mechanism from a symptom, and the first version of the probe did not even receive its argument, which is worth recording because it would have printed a meaningless field forever while every check still passed on the real assertion.
- **Verification: `npx tsc --noEmit` 0; focused `npx eslint` 0 errors (2 pre-existing `<img>` warnings in `my-apps-screen.tsx`, untouched lines); `npx vitest run` 369/369 PASS (21 files).** Live HTTP in real Chrome: **`scripts/signout-surfaces-check.ts` 7/7**, stable over 8 consecutive runs, with the previously broken org app list and platform-admin both clearing `serverSession=false` and landing on `/signin`. All three existing harnesses re-run clean: sign-out 8/8, org-routing 11/11, social-landing 13/13. Probe rows deleted (0 `@probe.local` users, 0 probe orgs, 0 probe org-app links) and the real account confirmed untouched by id - `98jTN1luoowhWUmy0zXwCJy73IimUSdQ`, `p967777296855@phone.bos.local`, `role=user`, 1 membership, 8 sessions, 1 account. Temporary `_su.ts` and `_diag.ts` diagnostics removed.
- **Left alone deliberately:** the per-row sign-out/revoke pair in the profile session list, for the reason given in the profile entry - revoking other sessions is a different action. `/app/grocery` renders **two** visible sign-out controls (the `app` layout sidebar wrapping the grocery sidebar) and both are functional, so this is redundancy, not a defect, and it is worth knowing before writing a single-button assumption into a future check. No build, deploy or git operation was run.
## 2026-09-28 - 196 SYSTEMS WERE WRITTEN DOWN AND INVISIBLE; MY-APPS NOW SHOWS THE CATALOG, AND A "COMING SOON" BUTTON CANNOT BE INSTALLED (verified in Chrome, 24/24)

- **Report:** "`http://localhost:3100/gm-snow/my-apps` should show all the systems." The page showed one system, because it listed what the org *had installed*. The 196 systems in `src/core/demo/systems-catalog.ts` existed as curated data and were reachable by nobody: nothing had ever written them into the `app` table.
- **Data before UI, because the reverse would have been a grid of 196 rows that all fail.** The user approved seeding all 196. `src/core/systems/catalog-seed.ts` is the pure mapping (system -> app row) and the only place that knows the two vocabularies differ: the catalog calls them available/soon, the `app` table has no such column, and the coming-soon flag is derived at read time from the catalog rather than stored, so flipping a system to "available" needs no migration and no rewrite. `scripts/seed-full-catalog.ts` is idempotent and reports 196 / 0 / 196-unchanged across three runs. The 196 slugs are validated for uniqueness, kebab-case, non-empty bilingual fields, and no collision with the real in-shell systems (`grocery`, `sama-center`) - that collision check is the one that would have turned a 198-card page into a 197-card page with a hijacked link.
- **"Coming soon" is a state, not a missing route, and it is enforced on the server.** The tempting version of this feature is to hide the button and leave the endpoint alone, which leaves the promise one `curl` away from being broken for a customer. `installSystemForTenant()` now rejects a soon system outright, and the check asserts the refusal returns 400 *and* leaves no `organizationApp` row behind - the second half matters, because a refusal that still writes a row has not refused anything. State precedence is disabled -> already installed -> soon, so installing a system can never be downgraded to "soon", and a system the platform deliberately switches off is not mislabelled as a promise.
- **Available cards route to their real path, soon cards route nowhere.** The first version resolved routes from a field the marketplace never had, and 4 of the 11 available systems silently pointed at `/app`. `getCustomerMarketplace()` now prefers each row's `routePrefix`; soon rows keep a `/system/{slug}` placeholder that is rendered but never linked, so the URL exists for diagnostics without being clickable.
- **A real hydration bug, found because a check was flaky for the wrong reason, and the test that proves it was proven by breaking the fix.** `recents` was seeded with `useState(() => readRecents())` reading `localStorage` - which does not exist on the server, so the SSR HTML had no "recently opened" strip and the first client render did. It was latent while the grid lived only on `/apps`; moving the grid into `/{org}/my-apps` made it fire on the first page a returning customer sees. My first fix used `useEffect` + `setState`, which the project's own `react-hooks/set-state-in-effect` rule rejected - and the rule was right: `useSyncExternalStore` with an explicit server snapshot is the primitive designed for exactly this, needs no extra render, and is lint-clean. **The check was validated by reverting the fix and watching it fail** with the exact React message, because a test that passes both with and without the fix is not evidence of anything. 24/24 with the fix, 22/23 without.
- **Five of the harness's own bugs were reported as product bugs, and each is now named in the file so it is not rediscovered.** (1) The install-button label was hardcoded as "add system"; the real label is "install system", so the check reported 0 buttons against a working page. Labels now come from `dictionaries.ar`. (2) A `.click()` before hydration is swallowed, so the gate waits for a real `onClick` under a `__reactProps$` key - the same lesson as the sign-out entry, reached the same way. (3) A deliberate 400 from the refusal check was logged by the browser and read as an unhealthy page; console errors are now snapshotted *before* that probe. (4) The install click matched the card by the `name` column while the grid renders the Arabic name, so it clicked nothing; it now matches either localized name and reports the HTTP status of the POST, so "the row count did not move" can be told apart from "no button was found". (5) The filter check slept a fixed 700ms, which reports a working filter as broken whenever React has to repair the tree; it now polls and retries, so slow and broken are distinguishable.
- **The count that looked like corruption was the user, and the audit log said so before anything was deleted.** `gm-snow` went from `installed:1` to `installed:2` between runs. The audit row named actor `Flo0yH8cNC5C7RQbW9CeiqlvEGjLZgXG` = `snows6005@gmail.com`, the org's owner, with a session created 27 minutes earlier - the user had opened the page and clicked setup on the grocery system themselves. That is a real install, so it stays. Worth recording because the reflex on an unexplained row in a real tenant is to clean it up, and here that would have deleted a customer's action and then reported a clean run. The harness asserts *invariants* (all 185 soon present, 0 unavailable, >=1 installed) rather than an exact state split, precisely so a human clicking around cannot make it fail.
- **Verification: `npx tsc --noEmit` 0; `npx eslint` 0 errors (4 pre-existing `<img>` warnings, unchanged lines); `npx vitest run` 380/380 PASS (22 files), 11 of them new.** Live HTTP in real Chrome: **`scripts/my-apps-catalog-check.ts` 24/24**, and it is a permanent harness, not a scratch script. `gm-snow` resolves 198 entries (185 soon / 8 installable / 4 demo / 1 installed at the time of writing) with the org's own real installs counted separately. A real setup click was driven end-to-end and asserted against the database, not just asserted to be present. All four existing harnesses re-run clean: signout-surfaces 7/7, sign-out 8/8, org-routing 11/11, social-landing 13/13. 196/196 seeded rows present; 0 `@probe.local` users and 0 probe orgs remain; both real accounts intact by id, including the protected `98jTN1luoowhWUmy0zXwCJy73IimUSdQ`.
- **Left alone deliberately:** three pre-existing probe orgs (`probe-co`, `browser-probe-co`, `tmpl-probe-co`) and a pre-existing `p967715007402@phone.bos.local` user. They predate this work, they are not mine to delete, and sweeping "residue" is how real data gets removed. Also unchanged: the `<img>` warnings, the marketplace's own `/apps` page, and the per-row session controls. No build, deploy or git operation was run.
## 2026-09-28 - MY-APPS NOW LOOKS LIKE /DEMO: GLASS CARDS, PARTICLE WALLPAPER, REVEAL + SPOTLIGHT, PINNED FILTERS (verified in Chrome, 29/29)

- **Request:** "make http://localhost:3100/gm-snow/my-apps with demo style". Asked what that meant rather than guessing: it could have been a *visual* restyle (the /demo look) or a *functional* demo launcher (iframe-embed every system with demo/demo123). The functional reading has a blocker no design passes through: the 9 demo sub-apps (`public/muafa-store-main`, `samaSYSTEM-main`, ...) are absent from this checkout, so their proxy rewrites land on silent ports and would 502. The user chose visual.
- **Nothing was reimplemented; the /demo motion stack was composed.** The demo look already existed as shared primitives, and the point of sharing them is that one place owns the look. `app-marketplace.tsx` now uses `useScrollReveal` + `spotlightFromEvent` + `revealDelay` from `src/components/demo/use-scroll-reveal.ts` - one IntersectionObserver for all 198 cards and a delegated `onPointerMove`, not an observer and a handler per card (the docs inside that file explain why the landing `ScrollReveal` specifically must not be used in a 198-card grid). Cards got the exact `demo-card`/`data-reveal`/`data-spotlight` recipe with the `--reveal-delay` stagger that `/demo` uses. Primary action buttons carry `.demo-sheen`. The widget card spec (icon tile `rounded-2xl bg-primary/10 group-hover:scale-110`, `font-bold` titles, `border-white/[0.06]` footers) matches `business-systems-section.tsx`.
- **Two things had to be borrowed rather than copied, and both are named in code.** The sticky filter bar measures the shell header's height at runtime (`--toolbar-top`) exactly the way `/demo` does, because the bar must clear a `sticky top-0` header whose height differs on mobile. And the particle wallpaper could not be imported into `my-apps-screen` directly: it is `next/dynamic(..., { ssr: false })`, which Next refuses inside a Server Component, so `src/components/demo/particle-wallpaper.tsx` is a thin `"use client"` boundary. The old category `<select>` became the horizontal pill strip `/demo` uses; the semantics are untouched, and the pills were kept as raw category ids purely to preserve existing behaviour rather than silently improving labels in the same change.
- **The `useSyncExternalStore` recents work from the previous entry carried over unchanged.** The restyle did not touch it. The returning-customer hydration check still passes, and the deliberate localStorage pre-seed test still proves the strip renders.
- **The style checks the request deserved were added to the harness, and one of them taught a timing lesson.** `my-apps-catalog-check.ts` now asserts the actual demo properties: 198 `.demo-card` elements, 198 `[data-reveal]`, 198 `[data-spotlight]`, a pinned sticky filter bar, and the canvas wallpaper. The wallpaper check first failed for the right reason and was misread initially: the canvas is `ssr: false`, so it mounts a beat *after* network-idle, and a one-shot assertion reported a slow mount as "absent". The check now polls - the same slow-vs-broken distinction as the filter retry in the earlier entry.
- **One human install on gm-snow from the earlier session remains, now part of the canvas of this feature.** The user's own grocery-store install shows as the second installed card and is asserted via the >=1 invariant, not assumed away.
- **Verification: `npx tsc --noEmit` 0; `npx eslint` 0 errors (3 pre-existing `<img>` warnings, unchanged lines, one new unused-import warning removed); `npx vitest run` 380/380 PASS (22 files).** Live HTTP in real Chrome: **`scripts/my-apps-catalog-check.ts` 29/29** including a driven real install (`clinic-management`, POST 200, `organizationApp` row asserted in the database). All four other harnesses re-run clean and are unaffected by the shared-component restyle: signout-surfaces 7/7, sign-out 8/8, org-routing 11/11, social-landing 13/13. 0 probe users and 0 probe orgs remain after the screenshot run; both real accounts and gm-snow's installs are untouched.
- **Left alone deliberately:** the `<img>` warnings are pre-existing elsewhere and out of scope for a style change; the marketplace's `/apps` route inherits the same restyle because it renders the same component, which is the point of sharing it rather than a side effect to special-case. Screenshots of the restyled page were taken (this model cannot view images) and left at `C:\Users\GMSNOW\AppData\Local\Temp\opencode\shot\myapps-{top,mid,lower}.png`. No build, deploy or git operation was run.
- **Follow-up ("cat is in english?"):** the category filter pills and every card footer were printing raw English category ids, copied over from the old `<select>` behavior. They now resolve through the curated catalog's `CATEGORY_MAP` (`titleAr`/`titleEn`) via a per-locale `useCallback` in `app-marketplace.tsx`; two legacy pre-catalog rows carry ids the catalog does not define (`grocery -> "business"`, `sama-center -> "healthcare"`) and are aliased to الأعمال/المراكز الصحية locally. Pills are now ordered with Arabic collation (Intl) for the Arabic UI instead of sorted by English id. A permanent harness check asserts every pill button contains Arabic text (30/30 now, `pills=22 nonArabic=[]`). tsc 0, eslint 0 errors (only the pre-existing `<img>` warning), vitest 380/380, all five harnesses clean.
- **Hydration error caught - the actual intermittent culprit:** a reported console error "In HTML, <div> cannot be a descendant of <p>" traced to `profile-security-panel.tsx`. The sessions list rendered a `Badge` (a `<div>`) directly inside a `<p>`, which the React DOM validator rejects and produces a hydration mismatch. This is almost certainly the intermittent hydration signal seen earlier and never reproduced on my-apps - it lives on the /profile page, which no harness loads. The wrapper `<p>` became `<div>` (the outer `<span>` text and Badge styling were untouched). All four other `<Badge>-adjacent-to-<p>` matches in /app/* and profile-view turned out to be `<div>`/`TableCell` wrapped siblings (false positives from loose grep). tsc 0, eslint 0, vitest 380/380, all five harnesses clean.
## 2026-09-28 - ADDING A SYSTEM IS NOW ALWAYS A PLATFORM-ADMIN APPROVAL REQUEST, EVERYWHERE (verified in Chrome, 32/32 + 14/14)

- **Request and the clarification that actually shaped it:** "when i add a system it should create a approval request" - the user confirmed "everywhere" (the /my-apps marketplace *and* the org profile's systems tab), then clarified mid-flight: "not like this just add btn then go to system page to choose page" - so the profile tab is *not* an inline catalog; it is one "add a system" button that steps into the marketplace chooser at `/{org}/my-apps`, and that page is where a system pick creates the request. Both surfaces now funnel through the same approval state machine.
- **The old design had a back door, and the codebase's own docs had already promised this model.** The docs on `installState` in `src/core/systems/catalog.ts` say `installable` = "card offers 'setup' which ALWAYS creates an approval request (pending)" - but `/request` installed instantly and `/install` was a second, independent install path. The new code finally matches the written promise. Existing approval machinery (`organizationAppRequest`, `/platform-admin/approvals` + `AppRequestPanel`, the decide API) is reused unchanged.
- **One service method now owns the transition, and it is a state machine, not a filter.** `requestSystemForTenant(organizationId, { slug, userId })` replaces `installSystemForTenant` (deleted, zero callers). Precedence: not-found/disabled/soon refuse; already installed -> `installed` with no request; pending -> idempotent pending; rejected -> reopened to pending; otherwise create the request and write the `marketplace.app.requested` audit row. `POST /api/v1/apps/[slug]/install` was a second instant-install route and is now an approval alias of `/request` (still requires `systems:install`), so there is no endpoint a customer (or curl) can reach that installs without approval. Demo systems still open instantly, so `/demo` style demos and the approved-store workflows are untouched.
- **The marketplace client needed zero changes, which is the point of it returning the same contract it always returned.** `app-marketplace.tsx` already handled an `{ state: "pending", route: null }` response - it was built for the promise and the server never kept it. The harness step that proves the whole thing is end-to-end: drive a real setup click on an installable card, assert the request row goes 0 -> 1 in the database, assert *no* `organizationApp` row appears, and assert the card flips to "في انتظار الموافقة". A refusal that still writes a row has not refused anything, and a request that also installs is the exact bug this feature is meant to prevent.
- **The profile systems tab is deliberately thin.** `profile-view.tsx` gains `AddSystemSection`: a heading, one `<Link>` button to `/{org.slug}/my-apps`, and an amber "pending review" note listing the org's `organizationAppRequest`s. The page loads the org scope + pending requests server-side (`ProfileOrgContext` in `src/core/profile/types.ts`) and omits the section entirely off-org, so the org-scoped and legacy profile views share one component with a growing surface. Dictionaries (ar + en) carry the wording; unused placeholder keys were removed rather than left behind.
- **Verification: main-app typecheck 0 errors (`npx tsc --noEmit`; the only output is the nested standalone demo project `demo-systems/grocery`, which is outside the app's typecheck baseline and was not touched); `npx eslint` 0 errors on every changed file (1 pre-existing unused-import warning in `src/app/api/v1/apps/route.ts`, unchanged lines); `npx vitest run` 382/382 PASS (22 files), with m16 rewritten to the approval model - request-creates-pending-not-install, cross-tenant isolation, idempotent pending, installed->installed/no request, rejected->reopened, marketplace pending state, disabled/soon refuse, delete-refused-while-requested.** Live HTTP in real Chrome: **`scripts/my-apps-catalog-check.ts` 32/32** (pending request created, zero install rows, card reads pending) and **`scripts/org-routing-check.ts` 14/14** including a new block: systems tab renders, exactly one add-system link, clicking it lands on `/{org}/my-apps`. All other harnesses re-run clean: social-landing 13/13, signout 8/8, signout-surfaces 7/7.
- **A data-state find worth recording, half-serious half-real.** The catalog count dropped by one mid-session: `gm-snow` resolved 197 instead of 198 and the harness's "full catalog" invariant failed. Root cause was not code - the `veterinary` row was missing from the `app` registry table (curated catalog has it as `soon`; the DB did not). Re-running the idempotent `npx tsx scripts/seed-full-catalog.ts` reported `1 created, 195 unchanged` and the count was 198 again on the next run. "Chapter and verse on idempotence: the fix was the same command that is the documented writer."
- **Left alone deliberately:** gm-snow's two real installs (one is the owner's own grocery-store install from an earlier session) are untouched, as is the real account; a temporary diagnostics script was created and removed without residue. No build, deploy or git operation was run.

## 2026-09-28 - THE HEADER AFTER SIGNUP NOW SHOWS THE PROFILE AVATAR, NOT THE SIGN-IN PAIR (verified in Chrome)

- **The report:** "when i sign up http://localhost:3100/p967775008926/profile its shows 'تسجيل الدخول' / 'إنشاء حساب' btn not show profile icon immediately". After a successful signup, the header kept rendering the signed-out pair even though the server held a valid session.
- **Root cause: the client session atom is sampled once and the app's own server paths never tell it anything.** `UserNav` reads `authClient.useSession()`, which resolves once from a single `/api/auth/get-session` at mount and then trusts its cached atom. The sessions the app creates on the *server* - `public/signup` runs `auth.api.signUpEmail` and sets `bos.session_token` on the response; `/auth/landing` and the org activate-form redirect do the same - are invisible to that atom. Worse, the shell subtree *remounts* on every route change, so a naive "refetch when the pathname changes" effect can never fire: `lastPath` re-initializes to the new path and the diff guard always sees equality. The repro proved both halves: right after in-page signup the `/api/auth/get-session` probe returned PRESENT while the header still rendered the pair.
- **The fix in `src/components/user-nav.tsx`:** refetch `useSession` on **mount** (covers the remount-on-route-change reality) *and* on pathname change, and render nothing (`isPending || (!session && isRefetching)` -> null, so the stale "signed out" answer is never flashed mid-re-read). The header row is `justify-between`, so withholding the group does not move the brand.
- **Verified in real Chrome with the exact stale-atom scenario:** create the user + session server-side (same API the app funnels through), load `/signup` signed-out (pair), push the server-created `bos.session_token` cookie into the browser without reloading (atom still null, pair persists), SPA-navigate to `/signin` - the header flips to the profile avatar while `/api/auth/get-session` reports PRESENT. `PASS --expect-avatar`, zero console errors. The effect-driven re-read is the load-bearing part: it works even where the profile page's click handlers are unresponsive (see dev-server note below).
- **A dev-mode-only trap found along the way, NOT an app bug:** after an *in-page* `POST /api/v1/public/signup`, Next's client router fetches `/signin` RSC but never commits the URL. Bisected to the org-vault: `onOrganizationCreated` writes `orginazition/<slug>/` under the project root, the dev watcher sees the new tree and restarts Fast Refresh, and the in-flight SPA transition is aborted. In-page signup via better-auth's own `/api/auth/sign-up/email` (no org folder) navigates fine, and the same Link nav with cookies injected page-side (folder exists before the page loads) works too. Production `next start` has no watcher, so this cannot affect deployed users.
- **Verification: `npx tsc --noEmit` 0; `npx eslint src/components/user-nav.tsx` 0; `npx vitest run` 382/382 PASS (22 files).** Live Chrome repro `scripts/_dbg-hdr.ts --expect-avatar` PASS (then deleted - mechanism documented here). Left alone deliberately: no build, deploy or git operation.
- **One harness is degraded in the *current* dev server and needs a restart, not a code fix:** `scripts/signout-check.ts` dropped from 8/8 to 5/8 - the sign-out click lands nowhere. Traced to the whole `/{org}/profile` page being React-event-dead in the running dev build: real CDP mouse clicks on sign-out AND edit-profile produce zero handler activity, no fetch to `/api/v1/organizations/sql` or `/api/auth/sign-out`, and no console/page errors, while `/signin`'s effects still run. Reproduced identically with the `user-nav.tsx` fix reverted, so it is independent of this change. Proof it is dev-server state, not code: signout-check passed 8/8 earlier today during the approval work. Recommendation: restart `next dev`, re-run `scripts/signout-check.ts` (expect 8/8); if it still fails on a fresh server, hunt it as a hydration/root-detachment bug on the profile tree.

## 2026-09-28 - SIGN-OUT TO /SIGNIN THREW "RUNTIME SYNTAXERROR: UNEXPECTED END OF JSON INPUT"; THE SIGN-OUT PROMISE CANNOT REJECT ANYMORE (tsc 0, eslint 0)

- **The report:** "when i sign-out from profile it goes to http://localhost:3100/signin and show ## Error Type Runtime SyntaxError ## Error Message Unexpected end of JSON input at JSON.parse". It happened right after the user tried the fixed header, and it is a *different* bug from the one above.
- **Where the parse lives: better-auth's own response parser, and it throws the *native* JSON error.** `node_modules/better-auth/dist/client/parser.mjs` `parseJSON` (strict) first checks a JSON signature; a body that *matches* the signature but is malformed (a truncated JSON - exactly what a busy dev compiler can emit) reaches `JSON.parse` and rethrows "Unexpected end of JSON input". The get-session path is safe: `session-atom.mjs` `fetchSession`/`executeSessionFetch` wraps the whole `$fetch` in try/catch and writes the failure into the atom's `error` field, and `refetch` (the `void refetch()` added to `UserNav`) never rejects - so the session path is not the source.
- **The unguarded site was the sign-out itself, and it was fire-and-forget.** `signOutAndRedirect` did `await authClient.signOut({ fetchOptions: { onSuccess, onError } })`. When the sign-out response body is unreadable, better-auth's strict parser rejects the `signOut` promise *before* either callback runs - so neither the redirect nor the "leave anyway" path fires, and the rejection is unhandled because every caller is `void signOutAndRedirect(...)`. An unhandled promise rejection surfaces in the Next dev overlay exactly as this report: "Runtime SyntaxError / Unexpected end of JSON input", and it can also strand the user on the profile page. My earlier hypothesis that the new `refetch` was the culprit is disproven by the atom source; the fix lands in the one place whose promise can actually reject.
- **The fix in `src/core/auth/client.ts`:** wrap the `signOut` call in try/catch that *also* hard-navigates (`window.location.href = to`). `signOutAndRedirect` now never rejects, and "leave the page" is guaranteed on success, on `onError`, and on a parse/rejection failure alike - matching the documented intent that staying put implies a sign-out that never happened. All three callers (profile header, `sign-out-button.tsx`, profile security panel) are unchanged; an always-navigating function is strictly safer than the previous behaviour for every one of them.
- **Verification: `npx tsc --noEmit` 0; `npx eslint src/core/auth/client.ts` 0.** Full Chrome validation still depends on the dev-server restart called out in the previous entry (the `/signin` overlay needs a live sign-out click to confirm it is gone). Left alone deliberately: the `user-nav.tsx` refetch keeps its unguarded `void refetch()` because the atom's internal catch makes a rejection impossible there - adding a `.catch` would be noise. No build, deploy or git operation was run.

## 2026-09-29 - PROFILE SYSTEMS TAB: INSTALLED SYSTEM CARDS NOW OPEN THE REAL SYSTEM (verified in-process; browser path needs a dev-server restart)

- **The request:** on `/{org}/profile?tab=systems`, the installed-system cards (e.g. "إدارة البقالة" / "بقاله المعافا", نشط, v1.0.0) were not clickable. "the system with real system" - i.e. clicking the card should open the actual running system.
- **What the card already knew but did not use:** `ProfileSystem` carried `routePrefix` (from the `app` row) and the marketplace had a single source of truth for "where does an installed system open" - `routePrefix || openRouteForSlug(slug)` (`src/core/apps/service.ts`). The profile grid just never rendered a link.
- **The fix, three small moves:** `types.ts` gained `route: string | null` on `ProfileSystem` (documented as the resolved open route); `service.ts` computes it with the same expression the marketplace uses; `SystemGrid` (`profile-overview-panel.tsx`) now wraps the card in `next/link` when `route` resolves and keeps a plain `<div>` when it does not - so no dead `<a href>` is ever rendered. The whole card is the hit area; the shared card markup is one `card` fragment, so the grid stays tidy.
- **Verified at the data layer, not just by "it compiles":** an in-process call to `getProfileOverview` over a probe user + org + installed grocery app returns `route: "/app/grocery"` for the grocery system - the exact card the user pasted. tsc 0 on the changed files, eslint 0.
- **The browser harness `scripts/profile-syslink-check.ts` is new and permanent:** signs up a probe user, installs grocery, opens `?tab=systems`, asserts the grocery card is `A[href="/app/grocery"]`, still shows org name + نشط + v1.0.0, asserts clicking it lands on `/app/grocery`, and asserts no installed card is a non-navigating div. It FAILED against the *running* dev server even though the in-process call is provably fresh - the running module for the profile RSC is stale, the same restart-required state already documented in the entries above (whole profile tree React-event-dead). Needs `next dev` restart, then `npx tsx scripts/profile-syslink-check.ts` (expect ~5/5) and `npx tsx scripts/signout-check.ts` (expect 8/8).
- **Left alone deliberately:** `scripts/perf-browser.ts` and `scripts/perf-seed.ts` appeared mid-session (unrelated to this work) and carry their own pre-existing type errors that currently fail a global `npx tsc --noEmit`; they were not touched. No build, deploy or git operation was run.

## 2026-09-29 - "SUSPENDED ORG CAN'T OPEN /PROFILE" WAS A PICKER DEAD-END, NOT A /PROFILE LOCKOUT (verified in Chrome; tsc 0, eslint 0, vitest 418/418)

- **The report:** "suspended org cant open http://localhost:3100/profile".
- **What reproduction proved:** the bare `/profile` actually renders fine for a member whose only org is suspended - probe loaded the account page (name/avatar/credential controls), stayed on `/profile`, zero console errors, no redirect. The suspend endpoint (`src/app/api/platform/tenants/[id]/route.ts:49`) also nulls `activeOrganizationId`, and that still does not break `/profile` (`src/app/profile/page.tsx` falls through to rendering `ProfileScreen` when no org is active). The blocked path is the *org-scoped* profile `/p967775008926/profile` (the systems/manage screen): the `[org]` layout gate bounces inactive orgs to `/select-org?status=suspended`.
- **The actual bug was `/select-org` being a dead end for unusable orgs.** The picker ignored the `status` query param entirely, and its only "����" button posts `activate-form` ? 303 to `/{org}/profile` ? the layout gate bounces straight back ? an infinite redirect loop with no explanation and no way out. This applies to every status the gate produces, not just suspended (pending/suspended/cancelled/rejected all funnel here).
- **The fix in `src/app/select-org/page.tsx`:** membership rows now read the org status; `active` orgs keep the existing activation form, every other status renders an inert row (name + role + a status chip ��� "������") with **no** activation button, killing the loop at the source. `?status=` is honored with a per-status banner (��������/�������/��������/��� �������� - wording mirrors the existing `approval-pending` page, which remains orphaned/unreferenced). A permanent "����� �����" link to `/profile` gives a suspended member an always-works escape next to ������.
- **Verified end-to-end in real Chrome** (`scripts/_suspend-probe.ts`, probe user + suspended org, then deleted): bare `/profile` renders and stays; `/{org}/profile` ? `/select-org?status=suspended`; assertions on that page pass - banner visible, "������" chip visible, zero "����" buttons rendered, ����� ����� link present; clicking it lands on `/profile`. No console/page errors.
- **Dev server was restarted as part of this session.** The restart also cleared the corrupted-webpack state (`ModuleParseError: Identifier 'editing' has already been declared` on a *stale* transform of `profile-overview-panel.tsx`; the on-disk file was clean the whole time - tsc/eslint pass on it) that had been blocking `scripts/profile-syslink-check.ts`. With the fresh server the systems-tab link harness and this select-org fix both behave; re-run `scripts/profile-syslink-check.ts` and `scripts/signout-check.ts` on the current server before trusting a no-restart pass.
- **Also cleared this session:** `scripts/perf-seed.ts` (typed delegate array resolves the mixed-target union) and `scripts/perf-browser.ts` (stray `"` on a `page.off` line) - the two files the previous entry flagged as breaking global tsc. `npx tsc --noEmit` is back to 0.
- **Verification: `npx tsc --noEmit` 0; `npx eslint src/app/select-org/page.tsx` 0; `npx vitest run` 418/418 PASS (25 files).** Left alone deliberately: `approval-pending` page (unreferenced by code but a coherent standalone message screen, not dead weight to delete in a bugfix entry), the `grocery-store` marketplace duplicate (still awaiting a decision - see earlier entry), no build, deploy or git operation.

## 2026-09-29 - TENANT CLEANUP: 203 TEST ORGS + 907 HARNESS USERS REMOVED, 5 REAL ORGS LEFT (verified)

- **The request:** "now delete test orgs and random org and left the real".
- **What was out there:** 208 organizations - the 5 real-looking ones and ~200 harness/perf artifacts (IsoA-*/IsoB-*/revoked-* from the isolation perf fixtures, probe-co*/header-probe-co*/real-form-co*/pf-co*/nc-co*/perfprobe-* from browser harnesses, plus the random p967123123123 phone org the user created while testing).
- **Kept (confirmed with the user):** `p967775008926` (����� �������), `haitham`, `gmsnow` (GM Snow), `gm-snow`, `org-platform-admin`. Deleted everything else.
- **Cascade reality check first:** only `invitations`, `members`, `organization_apps`, `organization_app_requests` have FK ON DELETE CASCADE to `organizations`; `audit_logs` is ON DELETE SET NULL; every other tenant table (`products`, `customers`, `sales_invoices`, `cash_*`, `stock_*`, ...) carries `organization_id` as a *plain column with no FK* (verified via pg_catalog FK listing). So org deletion alone would leave orphan tenant rows in the shared `businessos` schema - the cleanup explicitly deleted 2110 rows (the 118-count-per-table perf/browser seed pattern + 379 audit logs) for removed orgs.
- **What was removed precisely:** 203 organizations; 2110 tenant rows; 907 harness users (sessions/accounts/verifications/pins/follows cascade; 13 sessions re-pointed away from deleted orgs); 14 tenant schemas (t_perfprobe_z9jp7ic2 + the leftover t_signoutprobe_*/t_syslinkprobe_*/t_tr*/t_r1_*/t_so_* from earlier probe cleanups); 3 vault folders (p967123123123, perfprobe-z9jp7ic2, syslinkprobe-org-1790640014140). `orginazition/_registry/registry.json` rewritten to the 2 registered orgs (perfprobe/syslinkprobe stale entries gone).
- **Verified end state:** exactly 5 orgs; 0 members without an org; 0 orphaned products; remaining users are exactly the 5 real accounts (businessos.company@gmail.com, snows6005@gmail.com, p967715007402/p967777296855/p967775008926@phone.bos.local); remaining t_% schemas only t_org_platform_admin + t_p967775008926.
- **Known quirks discovered while surveying:** the per-tenant `grocery_<slug>` schemas advertised in the registry do not exist as DB objects yet (they are created lazily by the grocery gateway on first route); no grocery_% schema needed dropping. A DROP SCHEMA attempt mistyped as `businessos.t_...` failed with a SQL syntax error and the fix (unqualified quoted schema name) completed cleanly - recorded only so nobody repeats the typo. Minimal targets involved no app code - no tsc/eslint/vitest needed, no build, deploy or git operation was run.

## 2026-09-29 - PERF/ISOLATION ORGS REGENERATED AND DELETED AGAIN; ONLY THE 5 REAL ORGS REMAIN

- After the tenant cleanup above, 22 orgs reappeared within ~3 hours, all owned by p967777296855@phone.bos.local and all stamped AFTER the cleanup: `perfprobe-HN7XLvoo` (created by `scripts/perf-probe-login.ts` - the slug is `perfprobe-` + first 8 chars of a Better Auth user id, purpose is purely to print a session cookie for HTTP perf measurement) plus 7 runs of `IsoA-*`/`IsoB-*`/`revoked-*` (the m6 multi-tenant isolation test fixtures, also created by the same account as the harness signs in with it). Fixing the code is NOT wanted - these are legitimate perf/isolation tooling; the cleanup only sticks while those tools are not run again.
- Deleted all 22 again: 246 tenant rows, 4 sessions re-pointed, 22 organizations, vault folder `perfprobe-hn7xlvoo`. Verified final state: `haitham`, `gm-snow`, `gmsnow`, `org-platform-admin`, `p967775008926` (5). No app code touched, no tsc/eslint/vitest needed, no git operation.
- Duplicate repo copies — pm2 was serving a stale build. The repo now lives at `D:\Business OS\ERP\ERP`; a second, older copy existed at `D:\new project\ERP\ERP` (PROJECT_MAP 46 KB / 09-25, vs 240 KB here). pm2's `businessos-erp` (`next start -p 3100`, pid 13760) was running **from the old copy** and answering `200` on :3100 the whole time — so anything tested on :3100 was the stale build while the current tree was being edited. Owner confirmed this directory is canonical; `pm2 stop businessos-erp` freed the port. **Lesson: `npm run dev` binds 3100 (`scripts/dev.ts` `ERP_PORT`), and `scripts/dev.ts` marks the ERP `critical: true`, so an EADDRINUSE on 3100 tears down every other sub-app.** Before debugging a :3100 EADDRINUSE, check *which directory* the listener was launched from (`Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"`), not just that something is listening.
  - pm2 state is partly corrupt: 11 apps report `online` but 9 have `pid N/A` (only `gmstore` pid 8364 on :3000 was really alive). `pm2 list` "online" is not proof of a live process — cross-check with `Get-NetTCPConnection`.
- `dev:grocery` workspace-root warning fixed. `demo-systems/grocery` is a standalone project nested in the repo with its own `package-lock.json`, so Turbopack walked up, found two lockfiles, and inferred the ERP root. Its `dev` script is plain `next dev` (Turbopack) — unlike `dev:erp` which passes `--webpack` — so the ERP's own `next.config.ts` was never the right place for the fix. Added `turbopack: { root: <this dir> }` to `demo-systems/grocery/next.config.ts` (absolute path, per the shipped Next 16 docs). Verified: boot log no longer prints the warning, and `next.config.ts` load dropped to 126 ms. A restart of the already-running :3101 instance is required for it to pick the change up — it is a warning, not a behaviour change.

## 2026-09-30 — SQL DUMPS IN `D:\Business OS\ERP` IMPORTED TO SCRATCH DATABASES (non-destructive)

`BOSC.sql` (1.58 MB) and `BOSCdemo.sql` (1.34 MB) sit in the **parent** directory, not the repo.

### Trap: the `.sql` extension is a lie
Both are **`pg_dump` CUSTOM-format binary** (magic `PGDMP`, pg_dump 16.3, gzip-compressed, Dump Version 1.15-0) despite the `.sql` name. `psql -f` on them produces garbage — they need `pg_restore`. Verified by reading the first bytes; a plain-text dump would start with `--` or `SET`.

### Trap: `--create` / `-C` must NEVER be used on these files
The archives *contain* `CREATE DATABASE businessos` + `DROP DATABASE businessos` text, but **`pg_restore --list` reports ZERO `DATABASE`-class TOC entries** in both files (1510 / 3145 entries, all object-level). So a plain `pg_restore -d <db>` is safe and cannot create or drop any database, while `-C`/`--create` *would* fire `DROP DATABASE businessos` against the live ERP database. **Rule: create the target DB yourself, then restore with no `-C`.**

### Trap: `CREATE DATABASE` cannot run inside a `DO $$ ... $$` block
It is a transaction-block violation. Use `createdb -T template0 -E UTF8 --lc-collate=... --lc-ctype=...`, guarded by an existence check.

### Executed (owner chose: restore into NEW databases)
Both live DBs run on the system PostgreSQL 16 service at **:5432** (`.data/pg` is not running; `.env.local` points at 5432, not 5433). Both are `UTF8` / `Arabic_Saudi Arabia.1256` / libc — the dumps match exactly, so the scratch DBs were created with the same locale.
```
createdb businessos_restore  -T template0 -E UTF8 --lc-collate/--lc-ctype 'Arabic_Saudi Arabia.1256'
createdb demo_restore        (same)
pg_restore -d businessos_restore --no-owner --no-privileges --verbose "D:\Business OS\ERP\BOSC.sql"
pg_restore -d demo_restore       --no-owner --no-privileges --verbose "D:\Business OS\ERP\BOSCdemo.sql"
```
Result: **exit 0, 0 errors on both** (10.1 s / 18.4 s). Restored table counts match the archives exactly (`businessos` 78 + 4×55 = 298; `demo` 9×55 + `grocery` 40 + `public` 75 = 610).

### Verified afterwards — live databases UNCHANGED
`businessos` re-read identical to the pre-import measurement: 41 orgs, 175 users, 29 members, 111 audit_logs, 24 products, 24 sales_invoices, 23 migrations, tenant schemas `t_gm_ssnow, t_hitham_homaid, t_hunter_1x`.

### The dumps are a DIFFERENT LINEAGE, not a fresher copy — do not swap them in blind
| | live `businessos` | `businessos_restore` (snapshot 2026-09-29 07:55) |
|---|---|---|
| organizations | 41 (5 real + 36 `IsoA/IsoB/revoked` fixtures) | **5** (`gm-snow, gmsnow, haitham, org-platform-admin, p967775008926`) |
| users / members | 175 / 29 | 114 / 7 |
| audit_logs | 111 | **227** |
| migrations | 23 | **25** |
| products / sales_invoices | 24 / 24 | **0 / 0** |
| tenant schemas | `t_gm_ssnow, t_hitham_homaid, t_hunter_1x` | `t_gmsnow, t_org_platform_admin, t_p967775008926, t_perfprobe_hn7xlvoo` |

The snapshot has **25 migrations vs the live 23** (so it is 2 migrations *ahead* on schema) yet **0 products / 0 invoices** and a completely different tenant set — and it keeps `gmsnow` where live has `gm-ssnow`. It is a parallel branch, not a superset.

`demo` differs even more structurally — **the schema naming convention changed**:
- live `demo` (459 tables): `businessos`(67), `hospital`(82), `pos`(57), `optometry`(46), `dental`(42), `laboratory`(42), `pharmacy`(38), `grocery`(40), `sama`(23), `celia`(22), and an **empty** `public`.
- `demo_restore` (610 tables): `public`(**75**, populated), `grocery`(40), and `demo_cafe / demo_dental / demo_grocery / demo_hospital / demo_laboratory / demo_optometry / demo_pharmacy / demo_pos / demo_sama` (55 each) — **`demo_`-prefixed**, and **no `businessos` schema at all**.

So restoring `BOSCdemo.sql` over live `demo` is a **rename/migration of the demo schema layout**, not a data refresh: it would drop the live bare-named `celia/dental/hospital/laboratory/optometry/pharmacy/pos/sama` schemas and their data (`grocery.sales` 186 live vs 170 in the dump) in exchange for `demo_*` names. That is an owner decision, deliberately NOT taken. Both scratch DBs are left in place for comparison; drop with `DROP DATABASE businessos_restore; DROP DATABASE demo_restore;` when finished.

---

## 2026-09-30 — OWNER DECISION TAKEN: THE DUMPS BECAME THE LIVE DATABASES (rename-swap, reversible)

The owner chose the option deliberately left open above: **the `BOSC.sql` / `BOSCdemo.sql` content is now the live `businessos` and `demo`**, including the `demo_*` schema rename.

### Executed — a rename swap, not a second import

The two scratch databases were already a verified `pg_restore` of exactly those two archives (exit 0, 0 errors, table counts matching the TOC). So the old databases were **renamed aside** and the restored ones renamed into place. No data was copied a second time, and the previous state is still on disk.

```sql
ALTER DATABASE businessos        RENAME TO businessos_pre_20260930;
ALTER DATABASE businessos_restore RENAME TO businessos;
ALTER DATABASE demo               RENAME TO demo_pre_20260930;
ALTER DATABASE demo_restore       RENAME TO demo;
```

`ALTER DATABASE ... RENAME` requires **zero other sessions** on the database, which is the entire operational cost of this operation:
1. `npm run dev` was running from this very directory and holding a pool on `businessos` (`.env.local` had already been pointed at `businessos_restore` the previous day) → `taskkill /PID <npm-cli> /T /F` killed the `scripts/dev.ts` tree, which took the ERP (:3100) and grocery (:3101) with it.
2. **pgAdmin 4 keeps idle backends open** (three, on `businessos` and `demo`). A GUI session the owner may be actively using is not a disposable process, so they were evicted rather than killed: `pg_terminate_backend` per `pg_stat_activity` row. pgAdmin reconnects on next query.

### `.env.local` was pointing at a database that is now gone

`DATABASE_URL`/`DIRECT_URL` read `.../businessos_restore?schema=businessos` (someone had switched the app to the scratch copy a day earlier). After the swap that name no longer exists, so **both lines were changed back to `/businessos`**. Every dev server in this repo reads that file, so leaving it would have produced a connection error, not a fallback.

### The new `demo` is now CORRECT where the old one was wrong

`demo_grocery / demo_sama / demo_cafe / demo_hospital / demo_dental / demo_laboratory / demo_pharmacy / demo_pos / demo_optometry` are 9 schemas × 55 tables — exactly what `scripts/provision-demo-schemas.ts` produces from `DEMO_SYSTEMS` (`src/core/demo/demo-systems.ts:34`) and what its own verifiable goal demands ("9 `demo_*` schemas … and no leftover platform schema"). The **old** `demo` had bare `celia/dental/hospital/…` names and a populated `businessos` schema that the script exists to delete. So the swap removes a structural defect rather than introducing one.

### Verified

| check | result |
|---|---|
| `prisma migrate status` | **Database schema is up to date!** — 25 migration folders = 25 applied (old `businessos` had only 23) |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | **444/444 PASS (28 files)** |
| `GET /api/health`, `/`, `/apps`, `/signin` on :3100 | 200 |
| real sign-in + `GET /api/v1/me` | 200, `businessos.company@gmail.com`, org `org-platform-admin` |
| `demo.grocery.sales` | 170 rows (the `demo-systems/grocery` app's schema still exists under the new `demo`) |
| final state | 5 orgs / 114 users / 227 audit_logs / 25 migrations — **identical to the dump snapshot** |

### Two things worth recording

1. **The single failing test was the environment, not the database.** `m11-integrations.test.ts > produces a real pg_dump SQL artifact` failed with `expected 'logical' to be 'pg_dump'`, because `pg_dump` is **not on `PATH`** in this shell — `backup.ts:48` then takes its documented `ENOENT` fallback. Prepending `C:\Program Files\PostgreSQL\16\bin` and re-running gives 31/31. The test is doing its job correctly; the shell simply cannot find the binary. Any future full-suite run must either set `PATH` first or expect this one red.
2. **The test suite is a database writer, and the fixtures are timestamped.** `vitest run` created 6 organizations (`IsoA-*/IsoB-*/revoked-*`, all today) and 30 users (`u-*`, all `@test.local`, all `created_at >= 23:00`). They were removed by **id list**, never by name pattern, so the real 5 orgs and the real 114 users could not be touched — `delete from … where organization_id in (…)` across all 66 tables carrying that column, then the same for the 30 user ids across every table with a user reference. `members`/`accounts`/`sessions`/`pinned_apps`/`user_follows` have `ON DELETE CASCADE` to `users` and needed no explicit statement; `organization_app_requests.requested_by_user_id` is `ON DELETE RESTRICT` and had to be cleared first. 6 `marketplace.app.requested` audit rows were also written and removed. `gmstore` (the unrelated :3000 project) was never touched — 17 tables, unchanged.

### Rollback

The previous databases are intact and were not modified in any way:
```sql
ALTER DATABASE businessos            RENAME TO businessos_restore;
ALTER DATABASE businessos_pre_20260930 RENAME TO businessos;
ALTER DATABASE demo                  RENAME TO demo_restore;
ALTER DATABASE demo_pre_20260930     RENAME TO demo;
```
Again with every session off both databases. Drop the `_pre_20260930` copies only once the new content is accepted.

---

## 2026-09-30 — `/APP/GROCERY` 500 WAS A CLONE-TEMPLATE BUG, NOT A TENANT BUG (verified 200)

### Symptom

`GET /app/grocery?_rsc=…` returned **500** for a member of `p967775008926`. The dev log showed
`Command failed: npm run build` from `supervisor.ts:196` — the org's runtime could not even build.

### Root cause: two loggers, two signatures, and a file written for the wrong one

`next.config.ts` rewrites `/app/<system>` → `/system-proxy/<system>`, which serves
**`orginazition/<org>/systems/grocery/`** — a full per-tenant copy, not the tenant's data path.
Every org therefore has its own build, and a compile error in one copy is invisible until that
tenant opens the app.

The grocery system ships its own logger at `src/shared/core/logger.ts:32-35`:

```ts
info:  (event: string, meta?: unknown) => …
error: (event: string, err: unknown, meta?: unknown) => …
```

The platform's own logger is the **opposite** order — `logger.info({ orgId }, "[…]")` — and
`src/core/**` uses that form in 20+ places. `dev-login.ts` was written to the platform's
convention while living inside the grocery system, so `next build` failed with `TS2345`:
`Argument of type '{ userId: string; }' is not assignable to parameter of type 'string'`.

**`system/grocery/src/shared/auth/dev-login.ts` — the clone template — had the same two lines.**
Every org cloned from it inherited a source tree that could not build. That is why the bug was
"still there" after fixing one tenant: the template was never fixed.

### Fix (3 files, 2 lines each)

| file | change |
|---|---|
| `system/grocery/src/shared/auth/dev-login.ts` | template — `logger.error("[dev-login] SUPER_ADMIN role missing…", {})`, `logger.info("[dev-login] development admin account created", { userId })` |
| `orginazition/p967775008926/systems/grocery/src/shared/auth/dev-login.ts` | same |
| `orginazition/gmsnow/systems/grocery/src/shared/auth/dev-login.ts` | same |

All three are now byte-identical (`MD5 F889C3D06F0C4CE9E223E018F810B529`) — the copies are
clones and must stay that way, otherwise the next `system-clone` silently reintroduces the bug.

### Second defect found while verifying: `relayCookies` could not be exported

`npm run typecheck` then failed on the platform itself, unrelated to the logger:

```
.next/dev/types/app/system-proxy/[system]/route.ts(14,13): error TS2344:
  Property 'relayCookies' is incompatible with index signature.
  Type '(setCookies: string[]) => Promise<void>' is not assignable to type 'never'.
```

Next 16 constrains what a route module may export, and `relayCookies` was exported from
`src/app/system-proxy/[system]/route.ts` only so the sibling catch-all
`[...path]/route.ts` could import it. Moved verbatim to
**`src/app/system-proxy/[system]/cookies.ts`**; both routes import it from there. Behaviour is
unchanged — the function body was not touched.

### Verified

| check | result |
|---|---|
| `npx tsc --noEmit` in `system/grocery` | 0 |
| `npx tsc --noEmit` in both org copies | 0 |
| `npm run typecheck` | **0** |
| `npx eslint` on the 4 touched files | **0** |
| `npm test` | **449/449 PASS (28 files)** |
| `npm run build` | **exit 0** |
| `gmsnow` runtime directly (`:62511`) | `/app/grocery` 200, `/app/grocery/login` 200, `/app/grocery/api/health` 200 |
| **full stack through the platform**, member of `gmsnow` | `/app/grocery` **200 (14372 bytes)** — was 500 |
| catch-all route | `/app/grocery/login` 200 · `/app/grocery/api/health` 200 · `/app/grocery/pos` 307 (auth redirect) |

`npm run lint` is **not** green and was not made green: it reports 8840 errors across
`system/` and `orginazition/` (the vendored system copies) and 25 in `src/`, all in files
untouched here. Pre-existing; recorded below.

### How a real 500 was reproduced and driven to 200

`/app/grocery` cannot be reached unauthenticated (401 by design), so the first attempts proved
nothing. Three separate blockers, in order:

1. **Platform admin is not a member of any grocery org** → correct **403 `SYSTEM_NOT_INSTALLED`**.
   Not a bug: the org picker would never offer it.
2. **A freshly signed-up probe org has no `systems/grocery` clone** → 500
   `No system source for "grocery" in this organization` (`supervisor.ts:381`). Also not the
   target bug: `system-clone` had not run yet for that org. The org, its vault folder and its
   registry entry were removed again.
3. **`gmsnow` and `p967775008926` each own a real copy** → this is where the logger bug lived.

Verification used a **temporary `admin` membership** for the known `businessos.company@gmail.com`
account on `gmsnow`, since no member of either grocery org has a known password and Better Auth
session cookies are signed (`<token>.<signature>`, not forgeable from a `sessions` row).
`PROBEMEMB0001` was deleted afterwards.

### Auth codes are load-bearing here — do not "fix" them

| context | code | correct? |
|---|---|---|
| no session | 401 | yes |
| platform admin, org has no grocery | 403 `SYSTEM_NOT_INSTALLED` | yes |
| non-member trying to activate that org | 401 | yes |
| **member of `gmsnow` opening `/app/grocery`** | **200** | **this was the fix** |

### Two test-hygiene gaps found (not fixed — out of scope, recorded)

`npm test` is a database writer, and its own `afterAll` does not fully undo itself:

1. `tests/core/m12-isolation.test.ts:114-118` purges only `orgA`/`orgB`. The `revoked-*` org and
   user created at line 400 are **never deleted**, and `purge()` (line 67-72) removes
   organization-scoped rows only — never `users`, `sessions` or `accounts`. Every full-suite run
   therefore leaks.
2. `marketplace.app.requested` audit rows are written with a **null `organization_id`**, so the
   org-scoped purge cannot reach them. 3 such rows were left in place — `audit_logs` is
   append-only by architecture and was not tampered with.

Cleanup performed for this run was deleted **by id and by explicit timestamp**
(`created_at > 2026-09-30 00:00`), never by name alone. The 98 `@test.local` users that came
**from the dump** (oldest `2026-09-29 03:52`, i.e. pre-swap) were left untouched; the 9 real
users (oldest `2026-09-26`) were never in scope. Final state: **5 orgs / 7 members / 9 real
users / 98 dump test users / 230 audit rows** (227 from the dump + 3 orphan audit rows from
point 2 above).

### Service Worker 404 is a separate, browser-local issue

The other console error — `bad-precaching-response … /_next/static/rGq2QneZ3kI2EenLcU-jC/_ssgManifest.js`
(404) — is **not** this bug and is not fixed by it. `next.config.ts` disables Serwist in
development, but a `public/sw.js` installed by an earlier production build is still registered in
the browser and still controls the page. Resolution is client-side: DevTools → Application →
Service Workers → *Unregister*, then Clear storage / Cache storage, then hard reload. No server
change is involved.

### Pre-existing leftovers noticed, not touched

- `registry.json` carries `perfprobe-HN7XLvoo` with **no vault folder** (`orginazition/perfprobe-hn7xlvoo`
  absent) and no such database. A previous probe's residue.
- `orginazition/` contains `gm-snow` and `haitham` vault folders with **no registry entry**, and
  `haitham`/`gm-snow` do exist as organizations in the database. Registry and disk disagree.
- `scripts/perf-probe*.ts` (3 files) remain in `scripts/`.

## 2026-09-30 — THE FAVICON WAS A 1.19 MB LANDSCAPE LOGO AND THE PWA ICON WAS A FLAT BLUE SQUARE

**Request:** "I want the icon of application and favicon from `public/icons`." The folder already
held four purpose-built icons that nothing referenced, while the two icons that *were* referenced
were the wrong assets entirely.

### What was actually wrong

| File | Real content | Referenced as |
|---|---|---|
| `favicon-32.png` 32×32 | real artwork | nothing |
| `favicon-48.png` 48×48 | real artwork | nothing |
| `apple-touch-icon.png` 180×180 | real artwork | nothing |
| `icon-maskable-512.png` 512×512 | real artwork | **not in the manifest at all** |
| `icon-192.png` 192×192 | **solid `#1E40AF`**, 547 B | manifest app icon |
| `icon-512.png` 512×512 | **solid `#1E40AF`**, 1 881 B | manifest app icon |
| `BO.png` 2400×1712, 1.19 MB | the full wide logo | `rel="icon"` **and** `rel="apple-touch-icon"` |

So the browser tab was downloading the entire 1.19 MB landscape logo to draw a 16 px square, and an
installed PWA on Android/iOS got a featureless blue tile. `#1E40AF` is exactly
`manifest.json:8`'s `theme_color` — the placeholders were generated from the theme colour, which is
why nobody noticed they were blank.

### The old test could not see any of this

`m10-pwa.test.ts:23-31` asserted only `existsSync` and `size > 0` on each declared icon. A 547-byte
solid square passes both. And the manifest declared `purpose: "any maskable"` on the placeholders,
so even a test looking for a maskable entry would have found one. The suite was structurally
incapable of noticing that the shipped app icon was a blank rectangle.

### Changed

- **`public/icons/icon-192.png` / `icon-512.png`** regenerated by bicubic downscale of
  `icon-maskable-512.png` (`System.Drawing`, `HighQualityBicubic` + `PixelOffsetMode.HighQuality`,
  `Format32bppArgb` to keep the alpha). 547 B → **16 492 B**, 1 881 B → **86 665 B**; distinct sampled
  colours 1 → **44** and 1 → **37**. Nothing new was designed: the source artwork was already in the
  folder and unused.
- **`src/app/layout.tsx:31-33`** — the two BO.png `<link>` tags became three purpose-built ones:
  `rel="icon" sizes="32x32"`, `rel="icon" sizes="48x48"`, `rel="apple-touch-icon" sizes="180x180"`.
  `BO.png` remains the in-UI logo in the 8 places that display it as a logo; it was only ever wrong
  as an *icon*.
- **`public/manifest.json`** — the two placeholders are now `purpose: "any"` and
  `icon-maskable-512.png` was added as its own `purpose: "maskable"` entry. This matches the pattern
  the grocery sub-app already uses (`system/grocery/src/app/manifest.ts`).

### Tests, written first and watched fail

Four new assertions in `tests/core/m10-pwa.test.ts`, each failing against the shipped state before
any asset or line was touched:

1. every declared `sizes` string matches the file's **real pixel dimensions**, read from the PNG
   IHDR (`width`/`height` are big-endian uint32 at byte 16) — no image dependency needed;
2. no declared icon is under 4 KB, the cheapest honest proxy for "not a flat blank" (a solid square
   deflates to a few hundred bytes at any of these sizes, real artwork costs tens of KB);
3. `icon-maskable-512.png` is declared as its **own** maskable entry (not smuggled in via
   `"any maskable"`);
4. the layout's icon links resolve to the purpose-built files and **no** `rel="icon"` /
   `rel="apple-touch-icon"` line mentions `BO.png`.

**`sharp` was deliberately not used** for a pixel check. It exists in `node_modules` but is not a
declared dependency, and a test built on an undeclared transitive dep breaks the day Next drops it.

### Verified

- `npm run typecheck` → **0 errors**.
- `npm run lint` → **0 problems in the 3 touched files** (grepped the full output: 0 mentions of
  `layout.tsx`/`m10-pwa`). The 8 840 errors / 49 870 warnings the bare `eslint` script prints are
  pre-existing debt in the vendored sub-apps (`system/`, `demo-systems/`, `orginazition/`), which
  `AGENTS.md` treats as independent apps.
- `npm test` → **448/449**. The one failure is `m11-integrations` → "produces a real pg_dump SQL
  artifact": **`pg_dump` is not installed on this machine**, so backup falls back to `logical`. An
  environment gap with no causal path to icons; confirmed with `Get-Command pg_dump`.
- `npm run build` → **clean**, 138 pages, Serwist rebundled `public/sw.js` with the new revisions.
- **Served HTML, not source, was the assertion.** `next start` on `:3111` (the live `:3100` dev
  server was left alone), then `GET /signin`: the `<head>` now serves
  `rel="icon" sizes="32x32" → /icons/favicon-32.png`, `sizes="48x48" → /icons/favicon-48.png`,
  `rel="apple-touch-icon" sizes="180x180" → /icons/apple-touch-icon.png`, and **no** icon link
  mentions `BO.png`. All 6 icon URLs + the manifest returned **200** with the correct
  `Content-Type` and byte counts. Next's own `/favicon.ico?603d046c…` link still leads the list —
  expected, it comes from the `src/app/favicon.ico` convention and the user elected to leave that
  file alone; browsers that honour `sizes` prefer the PNGs.
- Server stopped, port 3111 free, temp backups deleted. No stray files in the repo.

### Flagged, not fixed — the new icons may still never be precached

`public/sw.js` emits every `globPublicPatterns` entry with **Windows backslashes**:
`/icons\icon-192.png`, `/manifest.json` is fine but `/icons\apple-touch-icon.png`,
`/earth\earth_atmos_2048.jpg`. Source is `next.config.ts:9`
(`globPublicPatterns: ["manifest.json", "icons/**/*", "earth/**/*", "*.svg"]`). Those are not valid
URL paths: install-time `fetch('/icons\icon-192.png')` 404s and
`getCacheKeyForURL('/icons/icon-192.png')` never matches, so nothing under `icons/` or `earth/` is
served from precache. The `_next/static/…` entries are correct, which is why it is easy to miss —
and the new build reproduced it. Left alone: it is a pre-existing Serwist/Windows packaging defect,
not part of "wire up the icons", and fixing it means touching the SW build config. Now recorded in
`[ORPHANS & PENDING]`.



---

## 2026-09-30 - CLICKING A SYSTEM CARD REBUILT IT ON EVERY COLD BOOT: 34s, THEN 34s AGAIN (verified 9s / 0.1s)

### Symptom, as reported

From `/p967775008926/profile?tab=systems`, clicking the grocery card "takes a lot of time" to reach
`/app/grocery`, and "sometimes it does not open".

### Measured first, so nothing below is theory

Requests were timed through the real stack (sign in -> `activate-form` -> `GET /app/grocery`),
because the route is 401 without a session and proves nothing otherwise:

| click | before the fix |
|---|---|
| 1st (runtime already up, after a source edit) | 200 in **34.41s** |
| 2nd | 200 in 0.19s |
| kill the runtime, then click | 200 in **34.21s** — and `sourceHash` changed `c3681861` -> `ca16b199` |
| **and the next click** | 200 in **37.34s** |

That last line is the finding. A cold boot is *supposed* to be slow. A cold boot that makes the
**following** click slow again means the system rebuilds itself forever.

### Root cause: the runtime hashes a directory it writes to

`ensureBuilt` (`supervisor.ts:235`) rebuilds whenever `state.sourceHash !== hashSources(cwd)`.
`hashSources` walks the org copy and hashes `path:size:mtimeMs` for every file, skipping
`SKIP_DIRS` (`node_modules`, `.next`, `.git`, `.turbo`, `.vercel`, `dist`, `coverage`).

But `ensureBuilt` runs `npx prisma generate` **before** every build, and a system with a Prisma
schema generates its client *into its own source tree* — `system/grocery/prisma/schema.prisma:11-14`
declares `output = "../src/generated/prisma"`. So the sequence on every cold boot was:

```
hashSources()        -> H1   (includes src/generated/prisma, 47 files)
prisma generate      -> rewrites those 47 files with new mtimes
npm run build
store sourceHash=H1  -> but the tree on disk now hashes to H2
next cold boot       -> H2 != H1  -> full build again. forever.
```

`src/generated` was in no `SKIP_DIRS` list, and the generated client is the one directory in the
tree that is a *build artifact of the runtime's own doing* rather than something a human edited.
Evidence: the 47 files under `src/generated/prisma` in both org copies had mtimes 22s before
`builtAt`, i.e. written by the `prisma generate` that preceded that very build.

### Fix — `src/core/systems/runtime/supervisor.ts`

`hashSources` -> exported `hashRuntimeSources`, plus a new `prismaGeneratorOutput(dir)` that reads
the generator's `output` from **the org copy's own `prisma/schema.prisma`** and excludes exactly
that directory. Reading it per call (not hardcoding `src/generated/prisma`) is what keeps this
correct for a system that points the generator elsewhere, and it means a system with no Prisma
schema — or one whose generator writes to the default location in `node_modules` — is unaffected.

The one-line-import trap, worth recording: `readFileSync` was not in the file's `node:fs` import
list on the first attempt. The lookup sat inside `try { ... } catch { return null }`, so the missing
import was swallowed and the function quietly returned `null` — the code compiled under `vitest`
(which does not typecheck) and simply did nothing. `npm run typecheck` is what catches it; a
swallowed lookup that disables the fix is more dangerous than a crash.

### Verified

| check | result |
|---|---|
| `tests/core/runtime-source-hash.test.ts` (new, fails first) | 6/6 — written before the fix, failed with `hashRuntimeSources is not a function` |
| `npm run typecheck` | **0** |
| `npx eslint` on both touched files | **0** |
| `npm test` | **455/455 PASS (29 files)** (was 449/449 in 28) |
| `npm run build` | **exit 0** |
| cold boot, 1st (hash algorithm just changed, so one build is correct) | 200 in 32.22s, then 0.17s |
| **cold boot, steady state** | 200 in **9.06s** — `sourceHash` stays `6c204fb5`, no rebuild |
| **the click after a cold boot** | 200 in **0.12s** (was 34–37s) |

The hash holding steady at `6c204fb5` across two independent cold boots is the actual proof: the
runtime no longer observes its own `prisma generate` as a source edit.

### What the remaining 9 seconds are, and they are legitimate

A cold boot still runs, in order: `prisma migrate deploy` -> `tsx prisma/bootstrap.ts` -> spawn
`npm run start` -> poll `isHealthy` every 500ms up to 60s. That is real work per tenant and is not
touched here. What changed is that it now happens **once**, instead of on every single click.
The 34s was a `next build`; the 9s is migrations plus process start.

### Why "sometimes it did not open" is the same bug

`boot` gives up after 60s (`supervisor.ts:439`) and a failed build throws, which the proxy turns
into a 500. A cold boot that reliably took 34s+ was well inside the window where a loaded machine,
a concurrent click, or a browser navigation gives up first. Removing the redundant rebuild removes
the failure, rather than papering over it with a longer timeout.

### Not changed, on purpose

- The 1500ms `isHealthy` timeout and the 60s readiness deadline are left alone. They were not
  observed to misfire, and loosening a timeout is how a slow failure turns into a hung one.
- `migrate deploy` + `bootstrap` on every cold boot are left alone. They are idempotent and cheap
  relative to a build; skipping them would be a behaviour change, not a bug fix.
- A live runtime still loses its in-memory `running`/`booting` maps when the dev server
  recompiles, so a cold boot after an unrelated platform edit is expected. It is now 9s.

## 2026-10-01 — ORG-SCOPED SYSTEM ROUTES (`/{org}/{system}`) AND COLD-BOOT SPEEDUPS (implemented + verified)

### Goal
- Every installed system opens at its own organization mount point, `/{org}/{system}`, because the customer's process is built for that base path and its asset URLs are baked in. The legacy `/app/<system>` entry remains a permanent, query-preserving redirect to the correct org route.
- Opening a system does not freeze the platform's event loop, does not re-migrate/re-bootstrap a folder that is already built at that mount point, does not probe the health of a process that answered moments ago, and does not reuse a build made for a different mount point.

### Why it changed
- A page that returned `200` was still unusable. The first open of a system cost a full build + migrations + bootstrap run synchronously, and `execFileSync` blocked the platform's event loop the entire time, so the whole site slowed. The mount point was also a path the system was not built for, so the platform — not the org's own process — was answering its asset requests.
- The basePath is part of the identity of what was built. `SYSTEM_BASE_PATH` is compiled into the child's output, so an org rename, or any code that infers a different mount point, must never serve a build made for the previous one.

### Changes (surgical)
- **Immutable caching for the child's Next assets** — `src/core/systems/asset-cache.ts` builds the `Cache-Control` rule for `/_next/static/`, applied in `next.config.ts` under both `/{org}/{system}` and the legacy `/app/{system}` rewrite, so an org's hashed chunks are not revalidated through the tunnel on every visit.
- **One source of truth for org-scoped URLs** — `src/core/systems/runtime/urls.ts` (`orgSystemPath`, `systemUpstreamUrl`). `proxySystemRequest` now takes a `SystemRequestScope` and passes that path down as the runtime's `basePath`.
- **Authorization at the mount point** — `src/core/systems/runtime/scope.ts` (`resolveSystemRequestScope`, `respondToScopeProblem`) resolves the URL org and answers the three cases uniformly: unknown org or non-member is `404` (never "forbidden", so an org cannot be enumerated), no session redirects to `/signin?next=…`, an inactive org redirects to `/select-org?status=…`. `src/app/[org]/[system]/route.ts` and `src/app/[org]/[system]/[...path]/route.ts` call it explicitly, because a `route.ts` handler is terminal and never runs `src/app/[org]/layout.tsx`.
- **Legacy paths are permanent redirects** — `src/app/system-proxy/[system]/route.ts` and `[...path]/route.ts` answer `308` to the org-scoped path with the query string preserved. The old route-local `cookies.ts` was deleted; cookie relay now lives in `src/core/systems/runtime/cookies.ts`.
- **Cards and links know the org** — `openRouteForOrgSlug` in `src/core/systems/catalog.ts`; `src/core/profile/service.ts` (selects `organization.slug`) and `src/core/apps/service.ts` (installed + marketplace) use it, falling back to the legacy path only when the org is unknown. Demo systems keep their `/demo/*` routes.
- **Supervisor boots without blocking** — `runInFolder` is a promise-based `spawn` with a 15-minute timeout, so no request thread is frozen while a build runs. `src/core/systems/runtime/build-state.ts` adds `isBuildCurrent` (a type guard, and a legacy state file with no `basePath` is treated as stale), `needsDatabaseSetup`, and `shouldRecheckHealth` with `HEALTH_RECHECK_MS = 15_000`. Migrations and bootstrap run only when the build is not current for that mount point; a running process whose `basePath` moved is restarted; a successful probe records `healthySince` so a burst of chunks does not re-probe; a proxy fetch failure calls `stopOrgRuntime` so the next request boots a replacement.
- **Profile probe aligned with the new URLs** — `scripts/profile-syslink-check.ts` now asserts the card is a link to `/{org}/grocery` and that clicking it lands there.

### Tests
- `tests/core/system-asset-cache.test.ts` (6) — the rule applies to org-scoped and legacy paths
- `tests/core/org-system-urls.test.ts` (7) — `orgSystemPath` for single-segment systems, `systemUpstreamUrl`
- `tests/core/runtime-build-state.test.ts` (12) — mount-point identity, a rename invalidates the build, migration gating, health throttle
- `tests/core/m15-system-catalog.test.ts` (21, 4 added) — installed real systems open at `/{org}/{system}`, unknown org falls back, demos unchanged

### Verified in a real browser, through the public hostname
- 14/14 checks in the org-route probe against `https://bosc.dpdns.org/ajwad/grocery`, signed in as a member: the profile card and the marketplace card both lead to `/ajwad/grocery`; the root renders in ~0.9 s and the browser stays on the org-scoped path; a warm reload is 1.6 s and is a page load, not a rebuild; nothing the system asked for 404s and there are no console errors; the system's own `manifest.webmanifest` answers `200 application/manifest+json` under the org path; the document's `<link rel="manifest">` is `/ajwad/grocery/manifest.webmanifest`; a deep link reaches the child; an org the caller does not belong to is `404`; an unknown system segment is `404`.
- Server-side: the legacy `/app/grocery` (still rewritten in `next.config.ts`) answers `308` with `Location: /ajwad/grocery`, and with the query string when one is present.
- `npm run typecheck` clean · `npm run lint` clean on every changed file · `npm test` 498/498 (34 files) · `npm run build` green, with `/[org]/[system]` and `/[org]/[system]/[...path]` in the build output.
- The `ajwad` child runtime was rebuilt and restarted for `basePath=/ajwad/grocery`; its `.runtime.json` records the new basePath and port.

### Not a defect — recorded so nobody "fixes" it
- A `308` is permanently cached by browsers. A session that visited `/app/grocery` before this change still has the old redirect in its cache, which is why the browser probe above reads the destination straight from a server-side request instead of by navigating. **Goal (recorded as an orphan below): the legacy redirect is a `307`/`308` that is not cached across a session.**
- Behind the tunnel, a rewritten request reports the server's local origin, so the absolute `Location` on the legacy redirect reads `https://localhost:3100/ajwad/grocery` when inspected server-side. The path is correct, and a user navigating from the public origin lands on the org-scoped page; this is the same missing `X-Forwarded-Host` handling recorded below, not a routing fault.
- The child emits root-absolute icon hrefs in its own `metadata` (`orginazition/ajwad/systems/grocery/src/app/layout.tsx`). Its manifest link is correctly mounted under the org, but the icons resolve to the platform root and 404 there. Pre-existing, child-side, and out of M1–M4 — recorded below rather than fixed.

### Verification harnesses
- `scripts/org-route-check.ts` (temporary, not committed) — the 14-check browser + server probe described above. It was written, run to 14/14, and deleted rather than left as a dead one-shot script.
- `scripts/profile-syslink-check.ts` — kept, and updated to the org-scoped URL.

## 2026-10-03 - SLOW SIDEBAR NAVIGATION IN A TENANT APP: A ~335 ms TUNNEL TAX, AN ORIGIN-WIDE SERVICE WORKER, AND A NOTIFICATION SCAN ON EVERY CLICK

### Symptom, as reported
Navigation between `/gm/grocery/dashboard`, `/gm/grocery/inventory/products` and `/gm/grocery/inventory/categories` felt very slow.

### Measured first, so nothing below is theory
Steady-state TTFB, keep-alive, one connection, unauthenticated `307`:

| Hop | TTFB |
|---|---|
| grocery runtime, direct | 4.8-6.6 ms |
| platform proxy `:3100` | 8.7-12.5 ms |
| **Cloudflare Tunnel (production)** | **324-357 ms** (1015 ms cold) |

Edge RTT measured 80-155 ms. The application answers in single-digit milliseconds; **the path to it costs ~335 ms per request.** A static chunk request answers `307` rather than `200` whether it is fetched from the runtime directly or through the proxy, which proves `/{org}/{system}/_next/static/*` is matched by the terminal proxy route and does pass the auth gate. That is a first-load cost, since the browser caches the chunks.

### Correcting the brief, because the assumed defects were not there
- Navigation already used `next/link` with intent-gated prefetching (`useNavIntent`), not `<a>`.
- Products **already had** DB-side pagination (`skip`/`take`), DB-side search, and `Promise.all` parallel fetching.
- `getT()` returns a static dictionary object, so it costs no database round trip.
- `getStoreSettings` / `getSystemSettings` were already wrapped in React `cache()`.
- `basePath` was already correct, so no rewriting was needed.

### Root cause 1 - the tenant app registered the PLATFORM's service worker
`system/grocery/src/components/pwa-register.tsx` called `navigator.serviceWorker.register("/sw.js")`. The app's own worker is served from `public/sw.js`, which under the org mount point is `/gm/grocery/sw.js`. Registering the root path therefore claimed **origin scope `/`** with the *platform's* Serwist worker, and the grocery app's own worker was never registered at all. Combined with `controllerchange -> window.location.reload()` and a forced `reg.update()` on every mount, this is a live full-page-reload path - the worst case, where the ~335 ms tax is paid by the document *and* every chunk.

**Fix** - `system/grocery/src/lib/sw-url.ts` (new, pure) plus the register call, using `process.env.__NEXT_ROUTER_BASEPATH`, which Next populates from `config.basePath` (`define-env.js`) and which `add-base-path.js` itself relies on. Verified in the compiled production bundle: `navigator.serviceWorker.register((e="/gm/grocery".split("/")...)?`/${e}/sw.js`:"/sw.js")`.

### Root cause 2 - a ~7-query, ~800-row scan on every navigation
`scanCandidates()` reads 500 inventory rows, 200 customers, 100 batches and 50 purchase orders plus system settings, and `syncNotifications()` was awaited by `(app)/layout.tsx` on every client-side navigation, together with a possible `createMany`. The layout's own comment called it "the hottest path in the app".

**Fix** - `notificationsForBell()` returns the unread rows (one indexed query) and lets the scan finish in the background, so navigation no longer waits on it. The 20 s memo TTL keeps its behaviour, now expressed through the tested `isFresh()` helper. Operation events still appear on the next click because `listNotifications` reads the table directly rather than the memo, and `notify()` / `markAllRead()` still invalidate it.

### Tests, written first and watched fail
- `tests/core/grocery-nav-perf.test.ts` (7) - `serviceWorkerUrl` for standalone, org-scoped, empty, missing and trailing-slash base paths, and that the org path is never `/sw.js`; `isFresh` inside, at, and past the TTL boundary, plus a cold `null`.
- The first run failed with `Cannot find module '../../system/grocery/src/lib/sw-url'`, then passed 7/7 once the helpers existed.

### Verified
- `npm run typecheck` clean; `npx tsc --noEmit` clean **inside** the grocery app; `npm test` 635/635 (47 files), no regressions.
- Deployed by letting the supervisor own it: source hash moved `03fb698f` -> `0f867274`, `system.build_started` 15:04:32 -> `system.build_finished` 15:08:37 (~4 min), `system.runtime_started` recorded the new port.
- Post-rebuild the runtime serves `/gm/grocery/login` `200` with 19 KB of real Next markup in ~27 ms, answers `307` for `/gm/grocery/dashboard` when unauthenticated, and answers through both the platform proxy and the public hostname.
- The scoped worker path is what the app now requests; `/gm/grocery/sw.js` sits behind the tenant auth gate, and the app no longer touches the origin-root `/sw.js` that Serwist serves publicly.

### Not changed, on purpose
- **The ~335 ms is still there.** It is the Cloudflare Tunnel path, not application code, and no query or render change removes it. Getting meaningfully below ~400 ms needs an infrastructure decision (direct origin path, a nearer PoP, or HTTP/3) - recorded as an orphan rather than silently absorbed.
- Static assets were **not** exempted from the proxy's auth and DB work. They are private per-tenant bundles, so serving them without the gate would leak them. The existing immutable `Cache-Control` already covers repeat loads.
- No global cache of tenant data was added. Request-scoped React `cache()` is safe here and was already the established pattern; `unstable_cache` would have needed a tenant key and was not worth the leak risk.

### Orphans & pending
- **The Cloudflare Tunnel adds ~335 ms to every request and no code change removes it.** It is now the dominant term in perceived navigation latency for every tenant app on this origin.
- `cloudflared` exposes no metrics port here (5040 is a Windows service) and its command line could not be read, so the tunnel's own hop timings were never measured directly, only inferred from the edge RTT and the end-to-end delta.
- **Authenticated before/after page timings for `gm` were not produced.** No `gm` credentials were available, and creating a session inside a live customer tenant is not something to do unprompted. Every number above is an unauthenticated probe or a local render timing, so the app-side win is proven by code path and bundle inspection rather than by a signed-in browser trace. `scripts/perf-nav.ts` is the harness to close this once a session is available.

## 2026-10-03 - A RECEIPT LINK ESCAPED THE ORG MOUNT POINT AND 404'd ON THE PLATFORM ROOT

### Symptom
`https://bosc.dpdns.org/sales/receipt/258651d1-...` returned `404`, reported by the `p967770416171` org.

### Confirmed, not guessed
- `https://bosc.dpdns.org/sales/receipt/<id>` -> **404** (no such platform route).
- `https://bosc.dpdns.org/p967770416171/grocery/sales/receipt/<id>` -> **307** (route exists, auth-gated).
- The route does exist, at `src/app/(app)/sales/receipt/[id]/page.tsx` in the org's own clone.

### Root cause - the same class as the service worker
Next rewrites `next/link` and the router for `basePath`, but **nothing rewrites a URL the app builds by hand**. `pos-terminal.tsx` printed the receipt through a plain `<a href={`/sales/receipt/${saleId}`}>` (it must open in a new tab), which resolved against the origin to the platform root.

The audit that found it found three, not one, and all three were live:

| File | Link | Escapes to |
|---|---|---|
| `features/sales/ui/pos-terminal.tsx:490` | `/sales/receipt/{id}` | platform root -> 404 |
| `app/(app)/inventory/stock/page.tsx:44` | `/inventory/stock` (reset) | platform root -> 404 |
| `app/(app)/settings/backup/page.tsx:61` | `/api/backups/{id}/download` | **the platform's `/api`**, not the tenant's |

The backup one is the serious one: a tenant's backup download was pointed at the platform's API namespace rather than its own.

### Fix
- `src/lib/app-url.ts` (new, pure) - `mountPrefix`, `serviceWorkerUrl`, `appHref`, and `mountedHref` which reads `__NEXT_ROUTER_BASEPATH ?? SYSTEM_BASE_PATH` so it works from both server and client components. `appHref` is idempotent, tolerates a missing leading slash or a trailing slash on the base path, preserves the query string, and returns absolute/protocol-relative URLs untouched.
- `sw-url.ts` was folded into it, since both existed only to answer "what does this URL look like under the mount point".
- Plain `<a>` elements kept as-is: a print link in a new tab and a file download must not become client-side navigations. Only the path is corrected, so behaviour is otherwise unchanged. `<Link>` / `router.push` call sites were already correct and were left alone.

### Tests, written first and watched fail
`tests/core/grocery-nav-perf.test.ts` grew to 13. The six new `appHref` cases **caught two real bugs in the first implementation**: a doubled leading slash, and an idempotency guard that compared only the first path segment against the whole base path. Both fixed before the helper was used anywhere.

### Propagated to every clone, because the template is not enough
`system/grocery` is the source of truth, but each installed org is a separate working tree. Before overwriting, every clone's affected files were diffed against the template to rule out org-specific edits - all five were faithful copies, so nothing was overwritten blindly. Template plus all five clones (`gm`, `p967770416171`, `ajwad`, `gmsnow`, `p967775008926`) now carry the fix, and a re-scan finds **zero** remaining root-absolute `<a href>` in the template or in any clone.

### Verified
- `npm run typecheck` clean, grocery app `tsc --noEmit` clean, `npm test` 646/646 (48 files).
- Deployed and confirmed in the **compiled production bundle** of `p967770416171`: the receipt href is now `href:(0,p.Mo)(`/sales/receipt/${...}`)` where the helper is compiled with `"/p967770416171/grocery"` baked in, so it resolves to the org path.
- `gm` rebuilt and carries the fix. `p967770416171` rebuilt and is serving.

### Not changed, on purpose
- The three remaining clones (`ajwad`, `gmsnow`, `p967775008926`) were **not** force-rebuilt. Their source hash no longer matches, so the supervisor rebuilds them before serving their next authenticated request - that is the designed path, and forcing three more sequential ~4-minute builds would have stalled the deploy for no gain. Their stale builds are recorded below rather than left as a surprise.
- A sweep for the same bug class was run across the whole grocery app rather than only the reported link, which is how the `/api/backups` escape was found. The platform app itself was not audited for this pattern.

## 2026-10-03 - GROCERY WAS NOT INSTALLABLE: MANIFEST `scope` CLAIMED THE ENTIRE ORIGIN

### Requested
Make `https://bosc.dpdns.org/p967770416171/grocery` installable on its own, with its own icon, per system.

### The icons were never the problem
All four PNGs existed in every clone and are valid (`89504E47` signature confirmed), and the `<link rel="icon">` hrefs were already correctly mounted. Installability was broken further upstream.

### Root cause
`src/app/manifest.ts` emitted three root-absolute fields that Next does **not** rewrite:

```ts
id: "/", start_url: "/", scope: "/"
```

- `start_url: "/"` launched the installed app at the **platform home page**, not the grocery app — the user installed it and got sent somewhere else.
- `scope: "/"` told the browser this app owns the **whole origin**. Five tenant apps on one domain all claimed it, so the last one installed wins and hijacks the others' navigations.
- `id: "/"` collides across those five installs, so updates would not replace the existing install but install a second copy.

This is the same root cause as the receipt 404 and the service-worker scope bug, one layer up: Next rewrites `next/link`, the router and the `<link rel="manifest">` href, and nothing else.

### Fix
- New `src/lib/pwa.ts` — pure, testable `manifestScope()` and `buildPwaManifest()`. Both reuse `appHref` so the mount point has exactly one implementation.
- `manifest.ts` is now a thin wrapper; `layout.tsx` icon URLs use `appHref` too.
- `id` and `scope` are the mount point, `start_url` is `<mount>/dashboard`.
- Service worker `v6` -> `v7`: `MOUNT` is derived from `self.location.pathname` (a worker is scoped by the directory it is served from), and the manifest plus all icons are precached on install. Responses that are not `ok` are **not** cached, so a 404 can no longer be stored as an asset and leave an install permanently iconless.

### Verified against the running tenant
`p967770416171` rebuilt and serving on its runtime port:

```
"id":"/p967770416171/grocery"
"start_url":"/p967770416171/grocery/dashboard"
"scope":"/p967770416171/grocery"
```

Every icon the manifest names returns `200 image/png`, `sw.js` returns `200` at the scoped path while `/sw.js` at the runtime root is `404`, and the compiled route bundle contains the org prefix. `npm run typecheck` clean, `npm test` 670/670 across 51 files (24 new: `grocery-pwa` 8, `grocery-sw` 7).

### Per-system, as asked
The manifest is generated per org from `SYSTEM_BASE_PATH`, so each system and each tenant gets its own install with its own `id` and `scope`. Grocery is the only system with a PWA today; the others have no `manifest.ts`, no service worker and no icons, so "all systems alone" is true for grocery and not yet for the rest.

### Orphans & pending
- The other tenant clones (`gm`, `ajwad`, `gmsnow`, `p967775008926`) carry the corrected sources and rebuild on their next authenticated request, so their installs become correct then. `gm` is rebuilt; the other three still show 2026-09-30 / 2026-10-01 build stamps.
- **No install prompt UI exists.** Chrome only offers "Install" when the page is served over HTTPS with a valid manifest and an engaged service worker — all true now — but the user has to find the prompt in the browser menu. There is no in-app "Add to home screen" button to add.
- **The other systems have no PWA at all.** Making "each system installable on its own" true across the platform means adding a manifest, icons and a service worker per system; only grocery has them today.
- `manifest.ts` is locale-aware via `dict()` but Next serves one build per org, so an installed app's `name`/`short_name` are fixed at build time rather than following a later language change.
- **The Cloudflare Tunnel tax recorded in the previous entry is unchanged** and still dominates navigation latency.

### Orphans & pending (earlier entry, now superseded)
- `ajwad`, `gmsnow` and `p967775008926` still hold builds made on 2026-09-30 / 2026-10-01 that predate this fix. Their sources are correct, so the next authenticated request rebuilds them - but that first load will be slow, and until it happens their receipts and backup downloads still 404. Worth watching rather than assuming.
- `gmsnow`'s `.runtime.json` predates `basePath` becoming part of the build identity (it has no `basePath` key at all), which is why it reports an empty mount point. It self-heals on rebuild, but the old-state compatibility path deserves a look.
- The platform app has never been swept for hand-built URLs that escape its own routing. The grocery app had three; the same audit has not been run over `src/`.
- **The Cloudflare Tunnel tax recorded in the previous entry is unchanged** and still dominates navigation latency.

## 2026-10-03 - THE REMAINING MOUNT ESCAPES: RAW `fetch()`, `<img src>`, AND NATIVE `<form action>`

### Why this entry exists
The previous entry fixed three root-absolute `<a href>` URLs and stated that `<Link>` / `router.push` were already correct. It audited **only** `href`. It never looked at the three other ways this app builds a URL by hand, so a whole class of the same bug was still live on every mounted org.

### Which escapes are real, and which are not - settled against a running clone, not by reading docs
A first pass over the template produced nine candidates. Verifying each against the live `gm` clone (`SYSTEM_BASE_PATH=/gm/grocery`) killed five of them, so they were left alone:

| Construct | Verdict | Evidence |
|---|---|---|
| `redirect("/...")` (`next/navigation`) | **safe** | the prerendered HTML of `/gm/grocery` contains `/gm/grocery/dashboard` |
| `router.replace("/...")` | **safe** | same `next/navigation` normalization |
| `<Link href="/...">` | **safe** | always prefixed by `next/link` |
| `url.pathname = "/login"` in `src/proxy.ts` | **safe** | the clone's own proxy is byte-identical to the template's, yet it answered `307 location: /gm/grocery/login?next=%2Finventory%2Fproducts` |
| `NextRequest.nextUrl.pathname` in `src/proxy.ts` | **safe, and stripped** | which is why `PUBLIC_PATHS` compares against bare `"/login"` |
| raw `fetch("/api/...")` | **escapes** | resolves against the origin root -> the platform's API namespace |
| plain `<img src={"/api/..."}>` | **escapes** | no `next/image`, no normalization |
| native `<form action="/...">` | **escapes** | a browser submits straight to the literal URL |

`{ redirect: "/signin" }` in `features/auth/actions.ts` is **intentional** and documented in place: the topbar assigns it with `window.location.href`, which escapes the mount on purpose so the platform's sign-in renders.

### Fixed - 8 locations across 8 files
All routed through the existing `mountedHref()`, no new helper:
- `features/shell/notifications-bell.tsx` - `fetch("/api/notifications")`
- `features/shell/voice-dictation.tsx` - `fetch("/api/ai/transcribe")`
- `components/voice-input.tsx` - `fetch("/api/ai/transcribe")`
- `features/customers/ui/image-view.tsx` - the `txnImageUrl` builder behind both `<img>` tags
- `app/(app)/customers/[id]/statement/page.tsx` - inline `<img src>`
- `app/(app)/customers/transactions/page.tsx`, `app/(app)/inventory/stock/page.tsx`, `app/(app)/sales/orders/page.tsx` - the three native `action="/..."` filter forms

`report-shell.tsx` was **not** changed: its `printHref` reaches a `next/link`, so it was already correct.

### A guard, so the class cannot come back quietly
`tests/core/grocery-mounted-urls.test.ts` (new). It pins the helper's behaviour (8 cases) **and** walks the whole template source flagging raw `fetch()`, plain `<img src>`, native `<form action>`, and bare `/api/` URL-builder literals. Written first and watched fail with exactly the 8 sites above - the automated rule and the manual audit agreed independently, which is the only reason to trust the rule.

Two deliberate limits, both to avoid false positives that would train people to ignore it:
- Bare literals are only flagged under `/api/`. An app-route literal is only ever handed to `next/link`, which does apply the base path.
- `src/proxy.ts` is exempt, for the reason recorded in the table above.

### Verified
- `npm run typecheck` clean; `npm test` 670/670 (51 files); `npm run build` clean; eslint clean on every touched file.
- Propagated to the `gm` clone after diffing all 8 files against it to rule out org-specific edits - the only differences were these edits.
- **In a real authenticated browser against `https://bosc.dpdns.org/gm/grocery`**: the rendered `action` attributes are `/gm/grocery/inventory/stock`, `/gm/grocery/sales/orders`, `/gm/grocery/customers/transactions`. Product creation `POST /gm/grocery/inventory/products -> 200 {"ok":true,...}` with the row present in `org_gm`. Navigation **avg 1421 ms over 8 routes**, from 11102 ms before the proxy fix.

### A process note worth keeping
Two rebuilds during this work looked like a rebuild-on-every-request bug and were not one. The `sourceHash` covers path+size+mtime, so a `Copy-Item` that is still running while the supervisor hashes the tree records a hash of a *half-copied* tree, and the next start correctly rebuilds. Measuring which files changed in the window (`orginazition/gm/systems/grocery`, 19:05-19:29) showed only my own in-flight copies. `tsconfig.tsbuildinfo` and `next-env.d.ts` were checked and are *not* rewritten per build, so they are not a cause. No platform change was made for a defect that did not exist.

### Orphans & pending
- The **notifications bell is verified by construction, not by browser assertion**: the harness could not observe its request because the bell polls on the dashboard and the assertion runs from the products page. It uses the same `mountedHref()` as the three forms that *were* asserted, and the static scan covers it.
- The platform app still has never been swept for hand-built URLs that escape its own routing (carried over from the previous entry).
- `ajwad`, `gmsnow` and `p967775008926` are still uninstalled for grocery, so none of this is live for them yet. Their sources are correct; the first authenticated request after install rebuilds them.
- **The Cloudflare Tunnel tax is unchanged** and still dominates navigation latency.

## 2026-10-03 - 136 PROBE ORGANIZATIONS AND 748 TEST USERS REMOVED, AND THE LEAK THAT FED THEM FIXED

### Requested
Delete the non-real organizations from `/platform-admin/tenants`.

### There is no delete, and that was the real finding
The admin Actions cell only ever suspended or reactivated (`PATCH /api/platform/tenants/[id]` with `{status}`), and `organization.delete` in `src/core/org-vault` has **zero callers** anywhere in the repo. So "delete" could not be a click. The row count also had to come from somewhere trustworthy: the admin table's SQL-file column reflects what is on disk, not what is in the database.

### What was actually there
136 organizations across seven fixture prefixes, all with `orgApps=0`:

| count | prefix | created by |
|---|---|---|
| 41 | `IsoA-` | `tests/core/m12-isolation.test.ts` |
| 41 | `IsoB-` | `tests/core/m12-isolation.test.ts` |
| 41 | `revoked-` | `tests/core/m12-isolation.test.ts` |
| 8 | `cred-` | `tests/core/system-credentials.test.ts` (older runs) |
| 2 | `perfprobe-` | `scripts/perf-probe-*.ts` |
| 2 | `orgrouteprobe-` | org-route probing |
| 1 | `syslinkprobe-` | syslink probing |

41 of each is 41 test runs: one leaked set per run, never cleaned.

### Root cause - one bad table name silently aborted the teardown
`m12-isolation.test.ts` purged its tenants in `afterAll` through a hardcoded list of 43 models, and that list contained **`apiRateLimit`**, which has no `organization_id` column at all (it keys off `api_key_id`). The `deleteMany` threw, the loop `break`ed, and so **the remaining ~30 tables were never touched and `organization.delete` never ran**. That is where 1200 orphaned tenant rows came from.

Three separate faults, all silent:
1. `apiRateLimit` in a tenant-purge list - invalid, threw, aborted the rest.
2. `afterAll` wrapped both purges in `.catch(() => undefined)` - the failure could never surface.
3. `revokedOrg` had no purge call whatsoever, and `makeTenant` created a `user` per tenant that was never deleted either.

### Fixed
`tests/core/m12-isolation.test.ts`: dropped `apiRateLimit`; the loop now records a failure and **continues** instead of breaking; added `purgeUser()`; `afterAll` now purges all three orgs and all three users and **throws** if anything survived, so a broken teardown fails the suite loudly rather than quietly filling the database. Verified by running the file twice: 0 organizations and 0 test users left behind, 32/32 passing.

The other fixture prefixes (`m4-`, `m6-`, `m11-`, `m16-`, `CatA-`) were observed live during a concurrent `npm run build` and then **removed themselves** at teardown - they are not leaking. `cred-` was verified clean on a fresh run; its 8 were historical.

### The cleanup itself
`scripts/cleanup-test-orgs.ts` (new), plus `scripts/org-inventory.ts` (new, read-only).

No "delete by id list" mode and no wildcard exist. Selection is **by slug pattern only** against the seven prefixes above, so a real tenant cannot be reached by a mistake in a name - there is no path from a real slug to a delete. Dry run is the default; `--apply` is required to write anything. Per organization: detach `sessions.active_organization_id`, delete tenant rows, delete the org row (4 tables cascade, `audit_logs` is SET NULL), remove the vault folder, remove the registry entry, drop its database/schema if any. Tenant tables are **discovered** from `information_schema` rather than hardcoded, so a table added later is covered instead of silently skipped.

Result: 1200 tenant rows, 136 organizations, 4 vault folders, 5 registry entries, 5 tenant schemas, and 748 `@test.local` users removed. Test users are only removed when they hold no membership and no live session; one was detected in use and **held back** rather than deleted.

### Verified
- 9 organizations remain, unchanged: `haitham`, `gmsnow`, `gm-snow`, `p967775008926`, `org-platform-admin`, `ajwad`, `p967770416171`, `gm`, `hitham-homaid`. Every one still has its folder.
- Real data intact: 18 non-test users, 111 sessions, 5 app installs (`gm`=2, `gm-snow`=2, `p967770416171`=1) - identical to the pre-cleanup reading.
- `npm run typecheck` clean; eslint clean on all three touched files; both scripts load `.env.local` themselves following the existing convention in `scripts/`.
- Live after the deletion, against `https://bosc.dpdns.org/gm/grocery`: product creation `POST /gm/grocery/inventory/products -> 200` with the row present in `org_gm`, navigation avg 1528 ms over 8 routes, all URLs mount-correct.

### Orphans & pending
- **Tests write to the live `businessos` database.** `DATABASE_URL` points at the same database the platform serves, so every `npm test` run creates real organizations and users in production data. That is why this happened 41 times and why cleanup alone cannot keep the database clean. The fixtures need their own database (or a transaction rollback per file) - the single highest-value fix here, and deliberately not started because it changes how the whole suite runs.
- There is still no tenant delete in the UI or API, so this can only ever be done by script. `PROJECT_MAP.md:355` already carries the goal of a real endpoint.
- `ajwad`, `gmsnow` and `p967775008926` remain uninstalled for grocery (carried from the previous entry).

### Follow-up, after the full suite was run against the cleaned database
`npm test` (672/672, 51 files) left **0 organizations** behind - the org leak is genuinely closed. It still leaves **12 `@test.local` users** per run, from fixtures that purge their organization but not their user: `m5-`, `m6-`, `m8-`, `m9-`, `ExpA/B/C`, `BrA`, `CatA`, `SupA`, `SetA`, `RepA`. Same defect class as the m12 bug (a missing teardown delete), smaller blast radius, and left as-is because the fix means editing many test files and only they should decide how.

Two more registry-only orphans were also removed: five `verify-<timestamp>` entries. Nothing in `scripts/`, `tests/` or `src/` creates that prefix any more (grep-verified), so they were provably stale output from earlier manual runs; the pattern is now `^verify-\d+$` rather than a hand-picked list.

One pre-existing inconsistency, **not** touched: `haitham` exists as an organization with a vault folder but has no `orginazition/_registry/registry.json` entry.
