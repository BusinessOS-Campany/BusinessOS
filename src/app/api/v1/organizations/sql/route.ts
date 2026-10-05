import { ok, withRoute, ApiError } from "@/core/http/api";
import { resolveTenantSpec } from "@/core/tenancy/context";
import { saveOrgSql } from "@/core/org-vault/provision";
import { readOrgSqlInfo } from "@/core/org-vault/sql-file";

/**
 * The org's portable SQL file over HTTP.
 *
 * The org is never named by the client: the slug comes from the session's active
 * organization (or the tenant host), so a caller can only ever save the org they
 * are actually in.
 *
 *   GET  -> metadata for the current org: size, sha256, last export, row counts
 *   POST -> write `database/<folder>.sql` now (the sign-out save)
 *
 * Both are no-ops for a platform admin with no active organization, so the
 * sign-out button can call POST unconditionally.
 */

export const GET = withRoute("v1.organizations.sql.status", async (request) => {
  const spec = await resolveTenantSpec(request);
  if (!spec) throw ApiError.badRequest("No active organization");
  const info = await readOrgSqlInfo(spec.slug);
  return ok({
    sql: {
      slug: info.slug,
      schema: info.schemaName,
      file: info.fileName,
      exists: info.exists,
      bytes: info.bytes,
      sha256: info.sha256,
      exportedAt: info.exportedAt,
      schemaPresent: info.schemaPresent,
      rowsTotal: info.rowsTotal,
      tablesWithRows: info.tablesWithRows,
    },
  });
});

export const POST = withRoute("v1.organizations.sql.save", async (request) => {
  const spec = await resolveTenantSpec(request);
  // A platform admin has no active organization, so there is nothing to save.
  // Answering 200 rather than an error lets the sign-out button call this
  // unconditionally instead of knowing which kind of user it is rendered in.
  if (!spec) return ok({ saved: false, bytes: 0, reason: "no-organization" });
  // `saveOrgSql` never throws: a failed dump is reported, not propagated, so a
  // customer is never blocked from signing out because a backup failed.
  const result = await saveOrgSql(spec.slug);
  return ok({ slug: spec.slug, ...result });
});
