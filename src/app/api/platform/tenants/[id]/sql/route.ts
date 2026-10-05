import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { saveOrgSql, restoreOrgSql, openOrgVault } from "@/core/org-vault/provision";
import { exportOrgSql, readOrgSqlInfo } from "@/core/org-vault/sql-file";

/**
 * Platform-admin control over one org's portable SQL file.
 *
 *   GET              metadata: size, sha256, last export, row counts, schema state
 *   POST {action}    export | save | import | open
 *
 * The file itself is streamed by the sibling `sql/download` route.
 *
 * Every action takes the org by database id, never by a client-supplied slug, so
 * an id for one org can never be used to reach another's data. Imports are
 * destructive by nature (the schema is replaced with the file's contents) and are
 * audited, unlike exports.
 */

const bodySchema = z.object({
  action: z.enum(["export", "save", "import", "open"]),
  /** `merge` replays the file over the live schema instead of replacing it. */
  mode: z.enum(["replace", "merge"]).optional(),
});

export const GET = withRoute(
  "platform.tenants.sql.get",
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePlatformAdmin(request);
    const { id } = await ctx.params;
    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true },
    });
    if (!org) throw ApiError.notFound("Tenant not found");

    const info = await readOrgSqlInfo(org.slug);
    return ok({
      tenant: { id: org.id, slug: org.slug, name: org.name },
      sql: {
        // File name only: the absolute vault path stays on the server.
        file: info.fileName,
        exists: info.exists,
        bytes: info.bytes,
        sha256: info.sha256,
        exportedAt: info.exportedAt,
        schema: info.schemaName,
        schemaPresent: info.schemaPresent,
        rowsTotal: info.rowsTotal,
        tablesWithRows: info.tablesWithRows,
      },
    });
  },
);

export const POST = withRoute(
  "platform.tenants.sql.action",
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id } = await ctx.params;
    const body = bodySchema.parse(await request.json().catch(() => null));

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true },
    });
    if (!org) throw ApiError.notFound("Tenant not found");

    // An org that was never provisioned has no folder and no dump to restore.
    if (body.action === "import" && !org.slug) throw ApiError.badRequest("Tenant has no slug");

    switch (body.action) {
      case "save": {
        const result = await saveOrgSql(org.slug);
        if (!result.saved) throw ApiError.conflict(result.error ?? "Export failed");
        return ok({ action: "save", tenantId: org.id, saved: true, bytes: result.bytes });
      }
      case "export": {
        const info = await exportOrgSql(org.slug);
        return ok({
          action: "export",
          tenantId: org.id,
          file: info.fileName,
          bytes: info.bytes,
          sha256: info.sha256,
          rowsTotal: info.rowsTotal,
          exportedAt: info.exportedAt,
        });
      }
      case "open": {
        const result = await openOrgVault(org.slug);
        return ok({
          action: "open",
          tenantId: org.id,
          schema: result.schemaName,
          schemaCreated: result.schemaCreated,
          loadedFromFile: result.schemaLoadedFromFile,
          errors: result.errors,
        });
      }
      case "import": {
        const mode = body.mode ?? "replace";
        const info = await restoreOrgSql(org.slug, mode);
        await prisma.$transaction(async (tx) => {
          await writeAuditLog(tx, { organizationId: org.id, userId: admin.id }, {
            action: "platform.tenant.sql.imported",
            entityType: "organization",
            entityId: org.id,
            after: { slug: org.slug, mode, file: info.fileName, bytes: info.bytes, rowsTotal: info.rowsTotal },
          });
        });
        return ok({
          action: "import",
          tenantId: org.id,
          mode,
          file: info.fileName,
          bytes: info.bytes,
          statements: info.statements,
          rowsTotal: info.rowsTotal,
        });
      }
    }
  },
);
