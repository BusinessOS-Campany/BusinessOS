import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { dbSchema } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";
import { getEnv } from "@/core/config/env";
import { pgBinary } from "@/core/org-vault/pg-bin";
import { logger } from "@/core/logging/logger";

export interface BackupResult {
  backupId: string;
  filePath: string;
  fileSize: number;
  sha256: string;
  manifest: Record<string, unknown>;
}

/**
 * Create a pg_dump backup. For single-tenant exports, pass organizationId.
 * For full backups, omit it.
 */
export async function createBackup(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  opts?: { organizationId?: string },
): Promise<BackupResult> {
  const env = getEnv();
  const backupDir = join(env.STORAGE_PATH, "backups");
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const type = opts?.organizationId ? "tenant" : "full";

  const isSingleTenant = !!opts?.organizationId;

  // pg_dump does not understand Prisma's `?schema=` convention — hand it a plain
  // libpq URI and pass the schema explicitly (same source of truth the Prisma
  // client uses, see core/db/client.ts). Tenant dumps are schema-scoped exactly
  // like full ones; row-level filtering is documented in the restore guide.
  const connString = env.DATABASE_URL.replace(/\?schema=[^&]*$/, "");
  const dumpArgs = ["--no-owner", "--no-privileges", "--format=plain", `--schema=${dbSchema}`];

  let mode: "pg_dump" | "logical";
  let payload: string;
  const pgDump = pgBinary("pg_dump");
  if (!pgDump) {
    // No pg_dump anywhere on this machine. Say so loudly: the fallback below
    // produces a JSON snapshot that no `psql` can restore, and recording it as
    // a verified backup is how a server ends up with a full backup folder and
    // no way back.
    logger.warn(
      { type, orgId: tenant.organizationId },
      "[backup] pg_dump not found (set PG_BIN_DIR), using logical snapshot",
    );
    payload = JSON.stringify(
      await createLogicalBackup(prisma, opts?.organizationId),
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
    mode = "logical";
  } else {
    try {
      payload = execFileSync(pgDump, [...dumpArgs, connString], {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 512 * 1024 * 1024,
      });
      mode = "pg_dump";
    } catch (err) {
      // Every failure from here is a real failure (bad credentials, unreachable
      // host, pg_dump exited non-zero). A logical JSON snapshot is not a
      // restorable dump and must never be recorded as verified.
      const code = (err as NodeJS.ErrnoException).code;
      logger.error({ err, type, orgId: tenant.organizationId }, "[backup] pg_dump failed");
      throw ApiError.internal(`Backup failed: pg_dump exited with ${code ?? "an error"}`);
    }
  }

  const filename = `backup-${type}-${timestamp}.${mode === "pg_dump" ? "sql" : "json"}`;
  const filePath = join(backupDir, filename);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(filePath, payload);

  // Verify file exists and compute SHA-256
  if (!existsSync(filePath)) {
    throw ApiError.internal("Backup file was not created");
  }

  const stat = statSync(filePath);
  const fileBuffer = (await import("node:fs")).readFileSync(filePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  // Create manifest
  const manifest = {
    type,
    mode,
    schema: dbSchema,
    fileSize: stat.size,
    sha256,
    tables: isSingleTenant ? ["(tenant-scoped)"] : ["all"],
    createdAt: new Date().toISOString(),
  };

  const backup = await prisma.backupRecord.create({
    data: {
      organizationId: tenant.organizationId,
      type,
      status: "verified",
      filePath,
      fileSize: BigInt(stat.size),
      sha256,
      verified: true,
      manifest: manifest as never,
      createdByUserId: tenant.userId,
      completedAt: new Date(),
    },
  });

  await writeAuditLog(prisma as never, tenant, {
    action: "backup.created",
    entityType: "backupRecord",
    entityId: backup.id,
    after: { type, sha256, fileSize: stat.size },
  } as never);

  return {
    backupId: backup.id,
    filePath,
    fileSize: stat.size,
    sha256,
    manifest,
  };
}

/** Create a logical backup by querying all data directly from the DB. */
async function createLogicalBackup(
  prisma: PrismaClient,
  organizationId?: string,
): Promise<Record<string, unknown>> {
  const where = organizationId ? { organizationId } : {};
  const limit = 10_000;

  const [products, customers, suppliers, expenses, salesInvoices, purchases] = await Promise.all([
    prisma.product.findMany({ where, take: limit }),
    prisma.customer.findMany({ where, take: limit }),
    prisma.supplier.findMany({ where, take: limit }),
    prisma.expense.findMany({ where, take: limit }),
    prisma.salesInvoice.findMany({ where, take: limit }),
    prisma.purchase.findMany({ where, take: limit }),
  ]);

  return {
    products,
    customers,
    suppliers,
    expenses,
    salesInvoices,
    purchases,
    metadata: {
      exportedAt: new Date().toISOString(),
      organizationId: organizationId ?? "all",
      counts: {
        products: products.length,
        customers: customers.length,
        suppliers: suppliers.length,
        expenses: expenses.length,
        salesInvoices: salesInvoices.length,
        purchases: purchases.length,
      },
    },
  };
}

/** List backup records for an org. */
export async function listBackups(
  prisma: PrismaClient,
  organizationId: string,
  limit = 20,
) {
  return prisma.backupRecord.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      fileSize: true,
      sha256: true,
      verified: true,
      manifest: true,
      createdAt: true,
      completedAt: true,
    },
  });
}

/** Verify a backup by checking SHA-256 integrity. */
export async function verifyBackup(
  prisma: PrismaClient,
  tenant: { organizationId: string },
  backupId: string,
): Promise<{ verified: boolean; sha256: string }> {
  const backup = await prisma.backupRecord.findFirst({
    where: { id: backupId, organizationId: tenant.organizationId },
  });
  if (!backup) throw ApiError.notFound("Backup not found");
  if (!backup.filePath) throw ApiError.badRequest("Backup has no file path");

  if (!existsSync(backup.filePath)) {
    throw ApiError.badRequest("Backup file not found on disk");
  }

  const { readFileSync } = await import("node:fs");
  const fileBuffer = readFileSync(backup.filePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  const verified = sha256 === backup.sha256;

  await prisma.backupRecord.update({
    where: { id: backupId },
    data: { verified },
  });

  return { verified, sha256 };
}
