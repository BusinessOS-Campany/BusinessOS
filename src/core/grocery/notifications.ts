import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";

export interface NotificationData {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href?: string;
  userId?: string;
}

export async function scanAndCreateNotifications(organizationId: string) {
  const created: string[] = [];

  const lowStockProducts = await getLowStockProducts(organizationId);
  for (const p of lowStockProducts) {
    const titleAr = `低库存警告: ${p.nameAr}`;
    const titleEn = `Low Stock: ${p.sku}`;
    const bodyAr = `المنتج ${p.nameAr} (SKU: ${p.sku}) مخزونه منخفض: ${p.currentQty} / ${p.minStock}`;
    const bodyEn = `Product ${p.sku} is low on stock: ${p.currentQty} / ${p.minStock}`;

    const existing = await prisma.notification.findFirst({
      where: {
        organizationId,
        href: `/inventory/products/${p.productId}`,
        isRead: false,
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          organizationId,
          titleAr,
          titleEn,
          bodyAr,
          bodyEn,
          href: `/inventory/products/${p.productId}`,
        },
      });
      created.push(p.productId);
    }
  }

  const expiringBatches = await getExpiringBatches(organizationId);
  for (const b of expiringBatches) {
    const titleAr = `批次即将过期: ${b.batchNo}`;
    const titleEn = `Batch Expiring: ${b.batchNo}`;
    const bodyAr = `الدفعة ${b.batchNo} للمنتج ${b.productName} ستنتهي صلاحيتها في ${b.expiryDate.toISOString().slice(0, 10)}`;
    const bodyEn = `Batch ${b.batchNo} for product ${b.productName} expires on ${b.expiryDate.toISOString().slice(0, 10)}`;

    const existing = await prisma.notification.findFirst({
      where: {
        organizationId,
        href: `/inventory/batches/${b.batchId}`,
        isRead: false,
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          organizationId,
          titleAr,
          titleEn,
          bodyAr,
          bodyEn,
          href: `/inventory/batches/${b.batchId}`,
        },
      });
      created.push(b.batchId);
    }
  }

  const creditLimitCustomers = await getCreditLimitCustomers(organizationId);
  for (const c of creditLimitCustomers) {
    const titleAr = `تجاوز حد الائتمان: ${c.name}`;
    const titleEn = `Credit Limit Exceeded: ${c.name}`;
    const bodyAr = `العميل ${c.name} تجاوز حد الائتمان. الرصيد: ${c.balance}, الحد: ${c.creditLimit}`;
    const bodyEn = `Customer ${c.name} exceeded credit limit. Balance: ${c.balance}, Limit: ${c.creditLimit}`;

    const existing = await prisma.notification.findFirst({
      where: {
        organizationId,
        href: `/customers/${c.id}`,
        isRead: false,
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          organizationId,
          titleAr,
          titleEn,
          bodyAr,
          bodyEn,
          href: `/customers/${c.id}`,
        },
      });
      created.push(c.id);
    }
  }

  return { created: created.length };
}

export async function listNotifications(organizationId: string, limit?: number) {
  const notifications = await prisma.notification.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit ?? 50,
  });
  return notifications;
}

export async function markAllRead(organizationId: string) {
  await prisma.notification.updateMany({
    where: { organizationId, isRead: false },
    data: { isRead: true },
  });
  return { updated: true };
}

export async function getUnreadCount(organizationId: string) {
  const count = await prisma.notification.count({
    where: { organizationId, isRead: false },
  });
  return count;
}

export async function deleteNotification(organizationId: string, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, organizationId },
  });
  if (!notification) throw ApiError.notFound("Notification not found");

  await prisma.notification.delete({ where: { id } });
  return { deleted: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLowStockProducts(organizationId: string) {
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      isActive: true,
      trackStock: true,
      minStock: { not: null },
    },
    select: { id: true, sku: true, nameAr: true, minStock: true },
  });

  const result: Array<{
    productId: string;
    sku: string;
    nameAr: string;
    currentQty: number;
    minStock: number;
  }> = [];

  for (const product of products) {
    if (!product.minStock) continue;
    const stockLevels = await prisma.stockLevel.findMany({
      where: { organizationId, productId: product.id },
    });
    const totalQty = stockLevels.reduce((sum, s) => sum + Number(s.qty), 0);
    if (totalQty <= Number(product.minStock)) {
      result.push({
        productId: product.id,
        sku: product.sku,
        nameAr: product.nameAr,
        currentQty: totalQty,
        minStock: Number(product.minStock),
      });
    }
  }

  return result;
}

async function getExpiringBatches(organizationId: string) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const batches = await prisma.productBatch.findMany({
    where: {
      organizationId,
      expiryDate: { not: null, gte: now, lte: thirtyDaysFromNow },
    },
    orderBy: { expiryDate: "asc" },
  });

  if (batches.length === 0) return [];

  const productIds = [...new Set(batches.map((b) => b.productId))];
  const products = await prisma.product.findMany({
    where: { organizationId, id: { in: productIds } },
    select: { id: true, nameAr: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p.nameAr]));

  return batches.map((b) => ({
    batchId: b.id,
    batchNo: b.batchNo,
    productName: productMap.get(b.productId) ?? "N/A",
    expiryDate: b.expiryDate!,
  }));
}

async function getCreditLimitCustomers(organizationId: string) {
  const customers = await prisma.customer.findMany({
    where: {
      organizationId,
      isActive: true,
      creditLimit: { gt: 0 },
      balance: { gt: 0 },
    },
  });

  return customers
    .filter((c) => c.balance > c.creditLimit)
    .map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.balance,
      creditLimit: c.creditLimit,
    }));
}
