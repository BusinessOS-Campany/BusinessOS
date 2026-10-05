# ROADMAP.md — Business OS Platform

Sequence is strict: a milestone starts only when the previous one's **Verifiable Goals** all pass AND `tsc + eslint + vitest + next build` are green. Sizes: S ≤1 session, M ~2, L ~3–5, XL ~6–10.

---

## M0 — Foundation (size M)
**Scope:** Next.js 16 scaffold (TS strict, Tailwind 4, shadcn init) · docker-compose (pg18+pgadmin) · Prisma 7 (`prisma.config.ts`, adapter-pg) + first migration · Better Auth wiring (credentials sessions) · pino logging core · health endpoints · error envelope · `.env.example` · seed script (platform admin user).
**Verifiable Goals:**
1. `docker compose up -d` → pgAdmin reachable; `npx prisma migrate dev` applies cleanly.
2. `POST /api/auth/*` register/login sets secure cookie; protected route rejects anonymous.
3. `/api/health` and `/api/health/database` return `{status:"ok"}` with real DB roundtrip.
4. Structured log line with requestId appears for each request; no console.log in codebase.
5. `npm run build && npm run lint && npx tsc --noEmit` all green.

## M1 — Tenancy Core (size L)
**Scope:** organizations/org_settings/custom_domains/branches/warehouses schema · TenantContext middleware (subdomain/slug/header) · repo factory w/ forced org scoping · permission catalog + role/membership tables + policy helpers · audit service (append-only) · isolation test suite v1.
**Verifiable Goals:**
1. Two seeded tenants; requests via tenant A's context physically cannot return tenant B rows at repo level (property-tested).
2. API without valid org resolution returns 404-style neutral error; suspended org gets blocked.
3. Permission check denies `sales.create` for role lacking it — server-side enforced (UI-independent test).
4. Every mutation in flows writes an audit row with actor+before/after.
5. Isolation integration suite passes across repos + API.

## M2 — Platform Admin Console (size L)
**Scope:** platform-admin realm (separate gate/layout) · tenants CRUD + suspend/activate/delete(guarded) · plans + limits + features editor · template registry + Grocery template bundle · announcements · support tickets · usage/analytics counters · impersonation (time-boxed, audited).
**Verifiable Goals:**
1. Owner creates tenant → owner-user invited → that user logs into tenant app with empty-but-configured environment.
2. Suspending a tenant blocks login/API within one request, restores cleanly.
3. Changing plan limits reflects in tenant usage endpoint immediately.
4. Impersonation creates prominent audit entry + banner; auto-expires.

## M3 — Tenant Admin & White-Label Base (size L)
**Scope:** branding record → CSS variable injection (logo/favicon/colors/radius/density/light-dark) · module registry constants + enable/disable gating nav/routes/API/AI surfaces · users/roles/permissions admin UI · localization ar/en switcher RTL/LTR · appearance builder (token-only) · navigation config.
**Verifiable Goals:**
1. Disabling "Accounting" removes it from nav, global search, dashboard widgets, and its API returns 403/module-disabled — verified by tests.
2. Branding changes reflect app-wide (incl. login screen of that tenant domain) without redeploy.
3. Locale switch flips direction + all visible strings via dictionaries (zero hard-coded strings lint rule passes on changed dirs).

## M4 — Core Business Modules (size XL)
**Scope:** products/categories/units/barcodes/prices · stock ledger + adjustments/transfers + low-stock detection · customers/suppliers ledgers + credit limits · sales invoices/items/payments/returns (atomic service) · purchases/receiving · expenses/categories · cash accounts/movements · number sequences · reports v1 (sales/profit/inventory/debt/cashflow).
**Verifiable Goals:**
1. Integration test: sale commits invoice+items+payment+stock movements+cash+customer ledger atomically; injected failure ⇒ full ROLLBACK, zero partial rows, sequence gap-tolerant.
2. Stock can never go negative unless org setting allows; every quantity change has a movement row (ledger sum == stock_level invariant tested).
3. Credit-limit breach blocks credit sale per workflow hook (M6 wires notification later).
4. Reports v1 numbers reconcile exactly with ledger-derived fixtures (no AI/no client math involved).

## M5 — Customization Engine (size XL)
**Scope:** custom field runtime (all 21 types, rules incl. conditional visibility, unique/index flags, encrypted flag) · form builder UI + renderer · saved views/table builder · dashboard builder (dnd-kit widget registry) · report builder (whitelisted compiler) · safe formula parser.
**Verifiable Goals:**
1. Adding "Country of Origin"(text) + "Expiry Date"(date, conditional on type=food) to Product via UI ⇒ field renders on create/edit forms, validates server-side, appears in table view + report datasets.
2. Formula `margin = (price-cost)/price` computes only through parser; attempt to inject JS identifiers throws validation error (unit-tested fuzz set).
3. Dashboard layout persists per user; widgets respect module-disabled state.
4. Report builder output equals hand-written aggregate query result on fixture data; exports CSV/XLSX/PDF-print.

## M6 — Workflows & Automations (size L)
**Scope:** trigger/event registry + transactional outbox · pg-backed job loop via instrumentation · condition AST evaluator · actions (notification, webhook, create/update record, email-log, task) · execution logs, retry/backoff, dead-letter UI.
**Verifiable Goals:**
1. Rule "stock < min ⇒ notify manager" fires exactly once per threshold crossing on fixture flow (idempotent event handling).
2. Webhook action delivers with retry on failure; execution log shows attempts + final status.
3. Event written in same tx as sale disappears if sale rolls back (no orphan triggers).

## M7 — Offline Engine (size L)
**Scope:** Dexie schema mirrors + bootstrap snapshot · outbox queue UX (pending badge, manual retry) · `/api/v1/sync` batch endpoint · idempotency_keys dedupe · conflict queue + admin resolution UI · device registry page.
**Verifiable Goals:**
1. E2E: go offline → create sale → reload app (data persists) → reconnect → sync completes → server shows EXACTLY ONE sale; replaying same batch changes nothing (idempotency proof).
2. Conflicting concurrent edits land in conflict queue, not silent overwrite; admin resolves both paths (keep-local / keep-remote).
3. Device list shows device id/platform/lastSync/pending count accurately.

## M8 — POS + Printing (size L)
**Scope:** POS screen (touch+keyboard, barcode input incl. camera scanner, categories/favorites, cart, discounts, customer select, cash/credit/partial, hold/resume, returns) wired to offline-capable sale service · receipt templates 58mm/80mm/A4 with tenant branding + QR.
**Verifiable Goals:**
1. E2E: scan→cart→pay cash→receipt print preview correct per width profile; sale identical to M4 atomic path.
2. Hold/resume survives full page reload offline; resumed sale syncs once.
3. Receipt honors tenant branding tokens + Arabic RTL layout.

## M9 — AI Layer (size L)
**Scope:** provider adapter + platform-admin config · tool registry (read: summaries/top-products/debt/inventory/search; mutating: create customer/product/expense/sale-draft) with permissions+zod+audit+metering · copilot chat (ar/en) grounded in business-knowledge settings · confirmation-token flow for mutations · NL→workflow drafts.
**Verifiable Goals:**
1. Ask "ما مبيعات اليوم؟" returns number produced exclusively by get_sales_summary tool call against DB (mock provider asserts tool path, integration asserts tool SQL correctness).
2. Mutating AI action cannot execute without explicit confirm token; token single-use + expires (tests).
3. Plan AI cap enforcement returns friendly limit error; usage logged with tokens/cost.
4. AI-generated automation stays inactive until owner presses Activate.

## M10 — PWA / Mobile / Tablet (size M)
**Scope:** manifest/icons/install prompt · serwist SW (app-shell + runtime caching strategy) · update toast · mobile bottom-nav + touch audits · tablet POS/dashboard layouts · virtualization checks.
**Verifiable Goals:**
1. Lighthouse PWA: installable, offline shell loads logged-in cached views.
2. Mobile viewport passes tap-target/nav contract on POS + Customers + Sales lists.
3. SW update prompts and activates cleanly without stale-cache bugs (test recipe documented).

## M11 — Integrations, Public API, Data Portability (size L)
**Scope:** `/api/v1/*` with API keys(scopes)+rate limits+audit · webhook endpoints mgmt (HMAC signing, retries, delivery logs) · import wizard (CSV/XLSX mapping+validation preview) for products/customers/opening stock · export center (permissions-aware) · backup job (pg_dump manifest + verification record + restore doc) · storage abstraction (local impl, S3-ready interface).
**Verifiable Goals:**
1. Third-party script using scoped API key reads allowed resource, gets 403 outside scope, respects rate limit (tests hit limiter).
2. Test webhook receiver validates HMAC signature; failed delivery retries w/ backoff and logs status.
3. Import 1k products with 3 invalid rows → preview shows exact errors → commit imports 997 only.
4. Backup job produces artifact + recorded sha256 verification (never claims success unverified).

## M12 — Hardening & DoD (size L)
**Scope:** full §71 isolation matrix (API/cache/storage/AI/search/reports) · RLS evaluation writeup (+implement if justified) · CSP/security headers audit · rate-limit tuning · index/perf review vs §67 · accessibility pass · docs completion (architecture/db/api/offline/ai/deployment/security/testing) · deployment guide (Docker primary) · full §104 Definition-of-Done E2E across ≥2 tenants simultaneously.
**Verifiable Goals:**
1. Isolation suite green across all surfaces for A-vs-B and revoked-role scenarios.
2. Full DoD scenario E2E passes twice concurrently (two tenants interleaved).
3. Zero TODO/placeholder grep hits in src/; `[ORPHANS & PENDING]` reduced to explicitly deferred items only.
4. Fresh-machine runbook: clone→compose up→migrate→seed→dev works (validated steps).

---

## Global Definition of Done (per milestone)
`tsc --noEmit ✓ · eslint ✓ · new + regression vitest suites ✓ · build ✓ · PROJECT_MAP.md synced ✓ · ORPHANS updated ✓`
