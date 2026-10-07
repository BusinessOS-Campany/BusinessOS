# AUDIT-2026.md — Security & Correctness Audit Pass

Live platform: Business OS (`next start -p 3100`, pm2 app `businessos-erp`). Database `businessos`, schema-per-tenant isolation active.
Audit window: **2026-09-24**. Scope: every `src/app/api/v1/**` + `src/app/api/platform/**` route, client call sites against them, prod DB probes.

---

## Endpoint sweep results

### Authenticated routes — all gated (verified per file)
`requireTenantContext(request)` → tenant guard (`requirePermission` 📖 `src/core/db/tenant-guard.ts` / `requireModule`) → route body. Platform routes additionally `requirePlatformAdmin` which **blocks impersonated sessions**. No ungated authenticated route found.

Categories covered: signup/verify, sync, self/me, search (tenant-scoped), organs of every app module (products, purchases, sales, returns, POS, inventory, expenses, suppliers, customers, reports, settings), custom fields/views/webhooks/workflows (admin), sama-center (calendar/advances/sessions/coverages/appointments/patients/services/employees/dashboard), apps, marketplace, public/products + public/customers (**intentional** `Bearer bos_xxx` key auth, tenant-scoped).

### Gate uniformity note
- Sama-center module routes use `requirePermission` **only** (no `requireModule`) — deliberate; clinic templates' `modulesEnabled` omits module keys, so a module gate would lock the clinic suite out.
- Settings permission is `settings:["read"]` / `settings:["manage"]` (catalog has no `settings:update`).
- `role === "admin"` sessions skip tenant-schema routing (registry access) — verified intended (platform console runs through schema-proxy registry paths).

## Problems found — status

| # | Severity | Problem | Status |
|---|----------|---------|--------|
| 1 | **CRITICAL** | Next.js 16 dynamic `params` are a Promise; `const { id } = (context as …).params` ⇒ `id === undefined` ⇒ `findFirst({ id: undefined, organizationId })` returned the **first org row** on id-scoped routes | **FIXED** (14 route files, `await params`) |
| 2 | CRITICAL | Restaurant/grocery & sama-center expense endpoints (`/expenses/categories`, `/expenses/[id]`) missing; collection GET was a raw array instead of `{items,total}`; POST expected a non-client body | **FIXED** (restored + rewired service layer) |
| 3 | HIGH | grocery brands/categories/suppliers: `[id]` PUT/DELETE absent; collection GET shape mismatch; suppliers had **no API at all** | **FIXED** (new routes; synthesized fields `code/email/creditLimit` for shape parity) |
| 4 | HIGH | grocery dashboard wired `todayProfit = todayExpenses` and passed `{total,paid,count}` objects to KpiCards (`formatMoney(object)` → NaN) | **FIXED** (numbers now) |
| 5 | HIGH | `app/page.tsx` read `me.org.name` which doesn't exist (me returns `organizations[]` + `activeTenant`) | **FIXED** |
| 6 | MEDIUM | `apps/[slug]/status` route `request.json()` throws on malformed body → 500 | **FIXED** (`.catch(() => null)`) |
| 7 | MEDIUM | Sama-center `settings` + `reports` pages call routes that never existed | **FIXED** (created, org-settings tag `samaCenter` + dashboard summaries) |
| 8 | LOW | Marketplace: single-app install is instant (`active`) vs template install queues `pending` | **SUPERSEDED** — the instant tenant path was removed; a tenant install now always queues for admin approval, and only `/platform-admin/approvals` runs `installSystemForOrg` |
| 9 | CHECK | `sama-center/dashboard` route BigInt totals must stay `Number` via `toJsonSafe` | PASS (checked `ok()` serialization path) |
| 10 | HIGH | `createCategory` cycle guard always fired for any child category (`detectCycle(parentId, parentId)` — visited set seeded with the parent → self-hit) → **all nested category creates 500 with "Category cycle detected"** | **FIXED** (removed impossible create-time check; update-path guard `parentId === id` + ancestor walk retained and regression-tested) |

## Prior hardening already verified (carried forward)
FIX-1 host↔authz binding · FIX-2 sync operations org-scoped · FIX-3 encryption key generated (`.env.local`, **never commit**) · FIX-4 sama null-transaction → prisma tx · FIX-5 sama RBAC · FIX-6 search gating · FIX-7 impersonation guard in `requirePlatformAdmin` · FIX-8 custom-fields/devices permissions · FIX-9 rate limits on signup/active endpoints. Encrypted fields masked as `<encrypted>`.

## App-install / activation semantics (do not regress)
- `installApp` → status `active` (instant, marketplace single app).
- `install-template` → status `pending` (approval flow).
- Org status gates: pending/rejected/suspended/cancelled → 403/402 bilingual envelope via `assertOrganizationActive`.

## Remediation record
14 route files converted to `async (request, { params }: { params: Promise<{ X: string }> })` + `const { X } = await params;`.
New/rewritten route + core files this window:
- `src/core/expenses/service.ts` (form helpers, list/categories/update/delete)
- `src/app/api/v1/expenses/{route.ts,categories/route.ts,[id]/route.ts}`
- `src/app/api/v1/sama-center/expenses/{route.ts,categories/route.ts,[id]/route.ts}`
- `src/app/api/v1/grocery/{brands,brands/[id],categories,categories/[id],suppliers,suppliers/[id],products}/route.ts`
- `src/app/api/v1/sama-center/{settings,reports}/route.ts`
- `src/app/api/v1/grocery/dashboard/route.ts` (KPI wiring)
- `src/app/app/page.tsx` (org name), `src/app/app/grocery/products/page.tsx` (dropdown mapping)
- `src/core/grocery/inventory-mgmt.ts` (category create-cycle fix, problem #10)

## Lint-fix pass (completed 2026-09-24)
`npm run lint` went from **72 warnings → 0/0**. All clears were no-op refactors: removed unused imports/vars (10 sama-center route files, products/suppliers API files, client pages, core services), `window.location.href` → `router.push`, static `/icons/BO.png` `<img>` → `next/image`, dynamic-remote `<img>` kept with justified eslint-disable, `useCallback` for `text-scramble` animation bound to deps.

## Vitest coverage (completed 2026-09-24)
`tests/core/phase3-restored-endpoints.test.ts` (**18 tests, all passing**) exercises the restored endpoint logic against the real DB (per existing m-series convention): expense form service (free-text category find-or-create + dedupe, client row shape, search/date/paging, org isolation, cash delta correction on update, cash reversal + delete, foreign-org notFound), grocery brands (list/search/paging `{rows,total}`, duplicate-conflict, update/delete), categories + products (parent/child create, productCount, child-delete guard, self-parent reject, search listProducts, seeded stock), suppliers (route ops: create/list/soft-delete + org scope), sama `samaCenter` settings (defaults when absent, deep-merge partial PUTs), reports summaries zero-totals, and dashboard KPI bigint shape (route converts to Number).

Full suite afterwards: **14 files / 225 tests passed** (baseline grew from the earlier isolation 8/8). `pg_dump`-not-found warnings in m11 are environmental (PATH), pre-existing.

## Verification
`npm run typecheck` clean · `npm run lint` 0 warnings · `npm run build` green · `pm2 restart businessos-erp` → `/api/health` 200 · restored routes probe: 401 unauthenticated, `[id]` routes 405-on-GET (wired, not 404/500). No regressions on prior FIX verification.