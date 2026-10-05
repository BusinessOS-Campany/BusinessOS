# RLS Evaluation — Row-Level Security in Business OS

## Decision: Application-Layer Isolation (NOT PostgreSQL RLS)

### Why Application Layer Wins for This Architecture

| Criterion | PostgreSQL RLS | Application-Layer (`tenantFilter`) |
|-----------|---------------|-----------------------------------|
| **Performance** | RLS adds a WHERE check on every query (planner overhead). With multi-column policies, index utilization suffers. | `tenantFilter` injects `organizationId` into Prisma `where` — indexes already cover this column on every table. |
| **Developer ergonomics** | Requires `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + per-table policies. Prisma does NOT natively generate RLS-compatible queries — raw SQL or extensions needed. | `tenantFilter(tenant, extra)` is a one-liner. Every service function receives a `TenantRef`. Enforced by convention + isolation test suite. |
| **Prisma compatibility** | Prisma's query engine doesn't understand RLS context. Policies would need to be set via session variables (`SET app.current_org = '...'`) before every query, adding connection pool complexity. | Zero Prisma friction. Filter is applied at the query level in application code. |
| **Multi-tenancy model** | Our model is shared-database, shared-schema with `organizationId` on every row. RLS adds defense-in-depth but at significant operational cost. | `organizationId` FK + index on every table + `tenantFilter` + isolation test suite provides equivalent guarantees. |
| **Audit compliance** | RLS is invisible to the application — no structured logging of "who accessed what tenant". | `withRoute` middleware logs every request with requestId + tenant context. Audit service tracks all mutations. |
| **Invitation/Membership model** | RLS would need to map `current_user` → `organization memberships` → `allowed orgs`. This is a superset of what we already do (each request resolves one active org via session). | `activeOrganizationId` on session is the single source of truth. Simpler mental model. |

### Current Isolation Architecture

```
Request → proxy.ts (security headers) → session → activeOrganizationId
  → route handler → withRoute wraps handler
    → service calls TenantRef { organizationId, userId }
      → tenantFilter(tenant) injects AND [{ organizationId }] into every Prisma where
```

### Defense-in-Depth Layers

1. **Schema level**: `organizationId` column + `@@index` on every tenant-owned table
2. **Query level**: `tenantFilter()` mandatory in all service reads; `tenantOwn()` on writes
3. **Post-read**: `assertOwned(row, tenant)` catches any leakage at the service boundary
4. **Permission level**: `hasPermission(role, statement)` enforces role-based access within an org
5. **Test level**: `tests/core/m12-isolation.test.ts` — 20+ tests proving A-vs-B isolation across every surface (products, customers, suppliers, sales, stock, reports, AI, exports, custom fields, storage, API keys, audit logs, number sequences)
6. **Cross-surface proof**: A single test iterates over 20 tables, asserting zero ID overlap between orgA and orgB rows

### When RLS Would Be Justified

- **External-facing APIs with untrusted SQL clients** (we use Prisma, never raw SQL from clients)
- **Compliance mandates requiring database-enforced isolation** (SOC 2 Type II accepts application-layer controls with test evidence)
- **Multi-database access patterns** where multiple applications share the same tables (we have a single monolith)

### Verdict

Application-layer isolation via `tenantFilter` + comprehensive test suite is the correct choice for this architecture. The 20+ isolation tests in `m12-isolation.test.ts` provide verifiable proof that is more transparent and auditable than opaque RLS policies. This is the explicitly deferred item in PROJECT_MAP.md (item 6).
