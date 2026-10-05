import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

type EntityType = "products" | "customers" | "suppliers" | "opening_stock";

export interface ImportPreviewRow {
  row: number;
  valid: boolean;
  errors: { field: string; message: string }[];
  data?: Record<string, unknown>;
}

export interface ImportPreviewResult {
  jobId: string;
  entityType: EntityType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { row: number; field: string; message: string }[];
  preview: ImportPreviewRow[];
}

export interface ImportCommitResult {
  jobId: string;
  committedRows: number;
  status: string;
}

/**
 * Parse raw CSV text into rows. Handles quoted fields and basic escaping.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw ApiError.badRequest("CSV must have at least a header row and one data row");

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

const ENTITY_VALIDATORS: Record<EntityType, (row: Record<string, string>, rowNum: number) => { row: number; field: string; message: string }[]> = {
  products: (row, rowNum) => {
    const errors: { row: number; field: string; message: string }[] = [];
    if (!row.sku && !row.SKU) errors.push({ row: rowNum, field: "sku", message: "SKU is required" });
    const nameAr = row.nameAr || row["اسم المنتج"] || row.name;
    if (!nameAr) errors.push({ row: rowNum, field: "nameAr", message: "Name (Arabic) is required" });
    const price = row.salePrice || row["سعر البيع"] || row.price;
    if (price && (isNaN(Number(price)) || Number(price) < 0)) {
      errors.push({ row: rowNum, field: "salePrice", message: "Invalid sale price" });
    }
    return errors;
  },
  customers: (row, rowNum) => {
    const errors: { row: number; field: string; message: string }[] = [];
    const name = row.name || row["اسم العميل"];
    if (!name) errors.push({ row: rowNum, field: "name", message: "Customer name is required" });
    return errors;
  },
  suppliers: (row, rowNum) => {
    const errors: { row: number; field: string; message: string }[] = [];
    const name = row.name || row["اسم المورد"];
    if (!name) errors.push({ row: rowNum, field: "name", message: "Supplier name is required" });
    return errors;
  },
  opening_stock: (row, rowNum) => {
    const errors: { row: number; field: string; message: string }[] = [];
    const sku = row.sku || row.SKU || row["رقم الصنف"];
    if (!sku) errors.push({ row: rowNum, field: "sku", message: "SKU is required" });
    const qty = row.qty || row.quantity || row["الكمية"];
    if (!qty || isNaN(Number(qty)) || Number(qty) < 0) {
      errors.push({ row: rowNum, field: "qty", message: "Valid quantity is required" });
    }
    return errors;
  },
};

/**
 * Validate a parsed CSV against entity-specific rules.
 * Returns the job ID and validation summary.
 */
export async function validateImport(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  entityType: EntityType,
  headers: string[],
  rows: Record<string, string>[],
  filename: string,
): Promise<ImportPreviewResult> {
  const validator = ENTITY_VALIDATORS[entityType];
  if (!validator) throw ApiError.badRequest(`Unsupported entity type: ${entityType}`);

  const allErrors: { row: number; field: string; message: string }[] = [];
  const preview: ImportPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 for 1-indexed + header
    const errors = validator(rows[i], rowNum);
    allErrors.push(...errors);
    preview.push({
      row: rowNum,
      valid: errors.length === 0,
      errors,
      data: rows[i],
    });
  }

  const job = await prisma.importJob.create({
    data: {
      organizationId: tenant.organizationId,
      entityType,
      filename,
      status: "preview",
      totalRows: rows.length,
      validRows: preview.filter((r) => r.valid).length,
      invalidRows: preview.filter((r) => !r.valid).length,
      errors: allErrors as never,
      createdByUserId: tenant.userId,
    },
  });

  return {
    jobId: job.id,
    entityType,
    totalRows: rows.length,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    errors: allErrors,
    preview,
  };
}

/**
 * Commit validated import rows — inserts valid rows only.
 */
export async function commitImport(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  jobId: string,
  validRows: Record<string, string>[],
): Promise<ImportCommitResult> {
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, organizationId: tenant.organizationId },
  });
  if (!job) throw ApiError.notFound("Import job not found");
  if (job.status !== "preview") throw ApiError.badRequest("Import job is not in preview status");

  let committedRows = 0;

  await prisma.$transaction(async (tx) => {
    switch (job.entityType) {
      case "products": {
        for (const row of validRows) {
          const sku = row.sku || row.SKU;
          const nameAr = row.nameAr || row["اسم المنتج"] || row.name;
          const salePrice = Number(row.salePrice || row["سعر البيع"] || row.price || 0);
          const costPrice = Number(row.costPrice || row["سعر التكلفة"] || 0);
          const barcode = row.barcode || row["الباركود"] || null;

          await tx.product.upsert({
            where: {
              organizationId_sku: { organizationId: tenant.organizationId, sku },
            },
            create: {
              organizationId: tenant.organizationId,
              sku,
              nameAr,
              nameEn: row.nameEn || null,
              barcode,
              salePrice: BigInt(salePrice),
              costPrice: BigInt(costPrice),
            },
            update: {
              nameAr,
              salePrice: BigInt(salePrice),
              costPrice: BigInt(costPrice),
            },
          });
          committedRows++;
        }
        break;
      }
      case "customers": {
        if (validRows.length > 0) {
          await tx.customer.createMany({
            data: validRows.map((row) => ({
              organizationId: tenant.organizationId,
              name: row.name || row["اسم العميل"],
              phone: row.phone || row["الهاتف"] || null,
              email: row.email || null,
            })),
          });
          committedRows = validRows.length;
        }
        break;
      }
      case "suppliers": {
        if (validRows.length > 0) {
          await tx.supplier.createMany({
            data: validRows.map((row) => ({
              organizationId: tenant.organizationId,
              name: row.name || row["اسم المورد"],
              phone: row.phone || row["الهاتف"] || null,
            })),
          });
          committedRows = validRows.length;
        }
        break;
      }
      case "opening_stock": {
        // Batch-fetch main warehouse once + all matching products
        const mainWarehouse = await tx.warehouse.findFirst({
          where: { organizationId: tenant.organizationId, isMain: true },
        });
        if (!mainWarehouse) break;
        const skus = [...new Set(validRows.map((r) => r.sku || r.SKU || r["رقم الصنف"]))];
        const existingProducts = await tx.product.findMany({
          where: { organizationId: tenant.organizationId, sku: { in: skus } },
          select: { id: true, sku: true },
        });
        const productBySku = new Map(existingProducts.map((p) => [p.sku, p.id]));
        for (const row of validRows) {
          const sku = row.sku || row.SKU || row["رقم الصنف"];
          const productId = productBySku.get(sku);
          if (!productId) continue;
          const qty = Number(row.qty || row.quantity || row["الكمية"]);
          await tx.stockLevel.upsert({
            where: { productId_warehouseId: { productId, warehouseId: mainWarehouse.id } },
            create: {
              organizationId: tenant.organizationId,
              productId,
              warehouseId: mainWarehouse.id,
              qty: String(qty),
            },
            update: { qty: String(qty) },
          });
          committedRows++;
        }
        break;
      }
    }

    await writeAuditLog(tx, tenant, {
      action: "import.committed",
      entityType: "importJob",
      entityId: jobId,
      after: { entityType: job.entityType, committedRows },
    });
  });

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "committed", committedRows, completedAt: new Date() },
  });

  return { jobId, committedRows, status: "committed" };
}
