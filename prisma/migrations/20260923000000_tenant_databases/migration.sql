-- M14 — database-per-tenant groundwork.
-- Each active tenant gets its own dedicated PostgreSQL database (bos_<slug>)
-- containing its isolated schema (t_<slug>); the platform registry (identity,
-- orgs, membership, apps, audits) stays in the shared `businessos` database.
ALTER TABLE "organizations" ADD COLUMN "database_name" TEXT;