-- M13 — schema-per-tenant groundwork.
-- Each active tenant gets its own PostgreSQL schema (t_<slug>); the platform
-- registry (identity, orgs, membership, apps, audits) stays in `businessos`.
ALTER TABLE "organizations" ADD COLUMN "schema_name" TEXT;