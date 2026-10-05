# ARCHITECTURE.md — Business OS Platform

Status: approved-for-implementation pending owner sign-off (2026-08-25). Companion docs: `PROJECT_MAP.md` (state), `ROADMAP.md` (sequence).

## 1. Principles

1. **Build once, configure per business** — tenant behavior differences live in DATA (branding, modules, fields, workflows), never in code branches per customer.
2. **Simplicity first** — one deployable, one database, no infra without measured need.
3. **Financial integrity is sacred** — atomic transactions, integer money math, server-recomputed totals; AI never writes financial numbers.
4. **Security over customization convenience** — customers get controlled schemas, never JS/CSS/SQL injection surfaces.

## 2. Multi-Tenancy Model

**Model: shared PostgreSQL schema + mandatory row scoping (`organizationId`) — chosen over DB-per-tenant and schema-per-tenant** because it supports 10k+ tenants with zero migration fan-out, simplest backups, and cross-tenant platform analytics; isolation enforced in code + tests (RLS re-evaluated at M12).

### 2.1 Tenant resolution
- Sources (priority): custom domain → subdomain → `X-Org-Slug` header (dev/API) → activeOrgId from session.
- `organizations` has stable `id`, unique `slug`; `custom_domains` maps verified hostnames → orgId.
- Resolution result cached under key containing the hostname/orgId (never global).
- Middleware attaches immutable `TenantContext { orgId, plan, status, enabledModules[], flags[], locale, currency }`.

### 2.2 Isolation enforcement — 4 layers (each independently tested)
1. **Edge/middleware:** unauthenticated/unresolved-host requests never reach tenant routes; suspended orgs blocked.
2. **Repository layer:** every tenant-table query auto-injects `{ where: { organizationId } }` via a typed repo factory; direct Prisma access outside `core/db` is lint-banned.
3. **Service layer:** permission checks (`module.action.scope`) + plan/module/feature gates before any mutation.
4. **Verification:** integration suite proves Tenant A cannot read/write Tenant B via API, repos, cache keys, storage paths, AI tools, reports, exports (M1 first pass, M12 full matrix).

Storage paths: `/tenants/{orgId}/products|documents|reports/…` served only through an authenticated streaming route (no public static mounts). Cache keys always include orgId. Webhook/AI/API-key records are org-scoped rows.

## 3. Identity & Access

- **Better Auth**: users/sessions (scrypt hashing, secure httpOnly cookies, CSRF built-in), plugins: organization (memberships/invitations/custom roles), admin, MFA-ready, API keys, rate limiting.
- **Two separate realms:** `platform-admin` console gated by a distinct role flag checked server-side (never reachable from tenant UI); tenant realm fully isolated.
- **Permission grammar:** `module.action.scope` e.g. `sales.create.branch`, `inventory.adjust.warehouse`, `reports.view.organization`. Scopes: organization | branch | warehouse | own. Roles are org-scoped rows; catalog of permissions is code-defined constants (no hard-coded checks in components — server is the only authority).
- Sessions track device metadata for the offline device registry.

## 4. Data Model Map (Prisma / PostgreSQL 18)

Groups (all tenant tables carry `organizationId` + leading composite indexes):

- **Platform:** plans(limits JSONB), subscriptions, invoices, payments(manual-first), usage_counters(monthly), announcements, templates(JSONB bundle), support_tickets/messages, platform_settings, ai_providers(config).
- **Identity/Org:** users, memberships(org,role,branchScope), roles, invitations, sessions/devices, organizations(status,snapshot branding), org_settings(sections JSONB: localization/security/notifications/ai), custom_domains, branches, warehouses.
- **Customization:** custom_fields(entity,type,rules,visibility,encrypted,order), form_layouts, saved_views, dashboards/widgets(layoutGrid JSONB), report_defs(compiledSpec), nav_configs, status_configs(entity,states[]), document_templates(kind,HTML-slots,css tokens).
- **Catalog/Stock:** categories, brands, units, products(+variants,barcodes,prices,costs), stock_levels(orgId,warehouseId,productId unique), **stock_movements(append-only ledger: type,qty signed,refDoc,userId)**, adjustments, transfers(two-leg movements).
- **Trading:** customers(balances derived from ledger), suppliers, sales_orders/items, payments(+allocations), returns, purchase_orders/items/receipts, expenses/categories, cash_accounts/movements, number_sequences(per org,per docType, gap-tolerant).
- **Ops:** audit_logs(immutable; who/what/before/after/requestId), notifications, webhook_endpoints/deliveries(signed,retry), api_keys(hash,scopes), sync_devices(lastSync,pendingCount), idempotency_keys(unique key→result), outbox_events, jobs(queue), ai_usage_logs(org,tokensIn/out,cost,model), conflict_queue.

**Money:** `amountMinor BigInt` + `currencyCode` + `fxRateToBase` captured at creation; base-currency views computed, originals preserved forever. All multi-record financial writes happen in ONE Prisma transaction (sale ⇒ invoice+items+payment allocation+stock movements+cash movement+customer ledger+audit+outbox) — any failure rolls back completely.

## 5. Customization Engine (the product's core)

- **Custom fields:** stored as typed config; values in `entity.customData JSONB`. Runtime builds a Zod schema from field defs (required/min/max/regex/unique/enum), enforces conditional visibility rules (`{when:{field,op,value}}` evaluated client-side for UX and server-side for truth), searchable/sortable via generated expression columns when flagged.
- **Form builder:** layout = ordered sections/tabs/columns referencing system+custom fields; renderer is schema-driven (RHF + zod resolver); drag-order persisted per form per org.
- **View/table builder:** saved_views store columns/order/filters/sort/group/density; filters compile to whitelisted predicate AST → repo-level translation (no string SQL).
- **Dashboard builder:** grid layout (dnd-kit), widget registry (kpi/chart/table/list/alerts/ai-insight) each with typed config; layouts per user or per role default.
- **Report builder:** user picks source (whitelisted datasets), fields, filters, groupBy, aggregates (sum/avg/count/min/max), date range → compiled to parameterized aggregate query through the repo layer; export CSV/XLSX/PDF(print CSS).
- **Formulas:** expr-eval-style safe parser (numbers/fields/arithmetic/comparison only); NO eval/new Function/JS objects; used in calculated fields & report metrics.
- **Appearance builder:** tenant picks from controlled design tokens (colors, radius, font scale, density, sidebar style) → written to branding record → injected as CSS variables at root; arbitrary CSS input does not exist.

## 6. Offline & Sync

Client (PWA): Dexie mirrors hot entities (products, customers, recent stock, held carts, settings snapshot) + `outbox` table. Every offline-created record gets a client UUID PK + idempotencyKey before leaving the device.

Server `/api/v1/sync`: batched ops replayed inside transactions; `idempotency_keys` unique index makes replays no-ops (never duplicate a sale). Conflict detection via `updatedAt` + version compare: non-financial metadata → LWW auto-resolve logged; financial/entity conflicts → `conflict_queue` surfaced to admins (never silent overwrite). Device registry updates lastSync/pending counts. Sync worker uses exponential backoff w/ jitter; failed ops land in a visible retry list.

## 7. Workflows & Automations

Triggers are code-registered domain events (sale.created, payment.created, inventory.low, debt.limit…). Services append events to `outbox_events` in the same transaction as the business write (transactional outbox). A pg-backed job loop (started via Next instrumentation; no Redis needed at this scale) evaluates matching workflow rules: conditions = safe JSON AST evaluator; actions = notification | webhook | create/update record (via services, permissions honored) | email-log | task. Every execution logged (status, duration, error), retries with backoff, dead-letter visible to tenant admin. AI-generated workflow drafts are inert until explicitly activated (§23 requirement).

## 8. AI Subsystem

- Provider adapter interface; Platform Admin configures endpoint/model/key (OpenAI-compatible by default). Per-plan request/token budgets metered in `ai_usage_logs`.
- **Tool Registry:** each tool declares zod args, required permission, read|mutating, dataset scope. Tools call the SAME tenant-scoped services/repos — AI has zero SQL access. Read tools answer immediately with real numbers; mutating tools return `pending_action` + confirmation token; high-risk verbs (delete-all, permission/security changes) are not tools at all.
- Copilot answers use tenant business knowledge (description/rules/thresholds/locale/currency) injected as system context. NL→automation produces a structured draft shown for [Activate] confirmation.

## 9. Security Baseline

Argon/scrypt password hashing (Better Auth default) · secure cookies (SameSite=Lax app, Strict for platform-admin) · CSRF token on state-changing browser flows · strict Zod parsing at every boundary · parameterized queries only (report compiler emits parameterized aggregates) · security headers + CSP via middleware · rate limiting (in-process now, pluggable backend later) · XSS-safe rendering (React escaping; rich text never raw-injected) · secrets only via env (see `.env.example`) · audit logs immutable to tenant roles · frontend permission states are UX hints only.

## 10. i18n, Theming, UX Targets

- next-intl dictionaries `locales/{ar,en}`; Arabic RTL default; all spacing/logic via Tailwind logical utilities; locale switch persists per user.
- Theme = CSS variables (`--primary --accent --sidebar --radius …`) hydrated from org branding (+ light/dark); components consume tokens only.
- Responsive contracts: mobile bottom-nav (Home/Sales/Inventory/Customers/More) ≥44px targets; tablet POS grid; desktop dense tables + keyboard shortcuts + virtualized lists; pagination everywhere by default.

## 11. Observability, Errors, Performance

- pino structured logs (requestId, orgId child bindings, redacted secrets), async transport; `/api/health`, `/api/health/database`, `/api/health/sync`.
- Error envelope `{ error: { code, messageAr, messageEn, requestId } }`; global boundary renders localized friendly page; stack traces server-only.
- Performance rules: composite indexes per §67 of spec, `include/select` discipline (no N+1), cursor pagination for ledgers, TanStack Query caching + optimistic UI, virtualized long tables, lazy routes for builders.

## 12. Environments & Deployment

- Local (Windows): Docker Desktop → `docker compose up -d` (postgres:18-alpine + pgadmin; redis block commented off) → `npx prisma migrate dev` → `npm run db:seed` → `npm run dev`.
- `.env.example` ships; `.env.local` gitignored. Keys: DATABASE_URL, DIRECT_URL, AUTH_SECRET, AI_API_KEY, NEXT_PUBLIC_APP_URL, STORAGE_PATH.
- Prod targets kept provider-neutral: self-hosted Docker (primary documented path), Vercel/Neon/Supabase/Railway compatible (standard PG URL + object-storage adapter swap).

## 13. Testing Strategy

Vitest units (money math, formula parser, condition evaluator, permission matrix, fx conversion) · Vitest integration against dockerized Postgres (atomic sale rollback, sync idempotency/replay, import validation) · tenant-isolation suite (§71 matrix) · Playwright E2E: onboarding→sale→reports happy path AND offline-sale→reconnect→no-duplicate scenario · CI gate per milestone: `tsc && eslint && vitest run && build`.
